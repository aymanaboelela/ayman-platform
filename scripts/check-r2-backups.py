#!/usr/bin/env python3
"""Is there actually a usable backup in Cloudflare R2 from the last 24 hours?

Dokploy runs both backups (the Postgres dump and the `media` volume tarball) and
writes a green "Backup done ✅" line to its own deployment log either way. That
line is not evidence: it is printed after the upload command exits, and the
upload command exits 0 for a zero-byte dump too. The only honest check is to
look in the bucket.

So this reads the bucket itself and asserts three things per backup:

  1. an object exists under the prefix,
  2. its LastModified is inside the freshness window (the schedule is daily, so
     anything older than ~26 h means at least one run silently did not happen),
  3. it is big enough to be real.

And for the database dump it goes one step further: it fetches the first bytes
with a Range request and decompresses them, because a truncated or empty upload
still has a plausible size in a listing. A pg_dump custom-format archive starts
with the five bytes `PGDMP`; anything else is not something `pg_restore` can
read, no matter what the listing says.

Standard library only — no boto3, no awscli — so the workflow needs no install
step. SigV4 is signed by hand below; it is about thirty lines.

Environment:
  R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
"""

from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import hmac
import os
import re
import sys
import urllib.parse
import urllib.request

ACCOUNT = os.environ["R2_ACCOUNT_ID"]
BUCKET = os.environ["R2_BUCKET"]
ACCESS_KEY = os.environ["R2_ACCESS_KEY_ID"]
SECRET_KEY = os.environ["R2_SECRET_ACCESS_KEY"]

HOST = f"{ACCOUNT}.r2.cloudflarestorage.com"
REGION = "auto"
SERVICE = "s3"

# The two backups run at 00:00 and 00:20 UTC. 26 hours leaves room for a slow
# run and for the hour Cairo moves twice a year without ever letting a whole
# missed day pass unnoticed.
MAX_AGE_HOURS = 26

CHECKS = [
    # prefix, minimum plausible size, which header to verify
    ("database/", 100_000, "pgdump"),
    ("media/", 10_000, "tar"),
]


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def _request(path: str, query: str = "", extra_headers: dict[str, str] | None = None) -> bytes:
    """A signed GET. `path` is already URL-encoded; `query` is canonical."""
    extra_headers = extra_headers or {}
    now = dt.datetime.now(dt.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(b"").hexdigest()

    headers = {"host": HOST, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date}
    headers.update({k.lower(): v for k, v in extra_headers.items()})
    signed_headers = ";".join(sorted(headers))
    canonical_headers = "".join(f"{k}:{headers[k]}\n" for k in sorted(headers))

    canonical_request = (
        f"GET\n{path}\n{query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    )
    scope = f"{datestamp}/{REGION}/{SERVICE}/aws4_request"
    to_sign = (
        "AWS4-HMAC-SHA256\n"
        f"{amz_date}\n{scope}\n"
        f"{hashlib.sha256(canonical_request.encode()).hexdigest()}"
    )
    signing_key = _sign(
        _sign(_sign(_sign(f"AWS4{SECRET_KEY}".encode(), datestamp), REGION), SERVICE),
        "aws4_request",
    )
    signature = hmac.new(signing_key, to_sign.encode(), hashlib.sha256).hexdigest()

    url = f"https://{HOST}{path}" + (f"?{query}" if query else "")
    req = urllib.request.Request(
        url,
        headers={
            **extra_headers,
            "Host": HOST,
            "x-amz-date": amz_date,
            "x-amz-content-sha256": payload_hash,
            "Authorization": (
                f"AWS4-HMAC-SHA256 Credential={ACCESS_KEY}/{scope}, "
                f"SignedHeaders={signed_headers}, Signature={signature}"
            ),
        },
    )
    return urllib.request.urlopen(req, timeout=60).read()


def newest_under(prefix: str) -> tuple[str, int, dt.datetime] | None:
    """The most recently modified object under `prefix`, or None."""
    body = _request(
        f"/{BUCKET}",
        f"list-type=2&prefix={urllib.parse.quote(prefix, safe='')}",
    ).decode()

    newest = None
    # R2 orders the XML fields Key, Size, LastModified — not the order the AWS
    # documentation examples use. Parse each <Contents> block on its own rather
    # than reaching across the document, or a single greedy regex silently
    # matches one object's key against another object's size. (It did.)
    for chunk in re.findall(r"<Contents>(.*?)</Contents>", body, re.S):
        key = re.search(r"<Key>(.*?)</Key>", chunk)
        size = re.search(r"<Size>(\d+)</Size>", chunk)
        modified = re.search(r"<LastModified>(.*?)</LastModified>", chunk)
        if not (key and size and modified):
            continue
        # `database/` itself is a zero-byte folder marker left by the dashboard.
        if key.group(1).endswith("/"):
            continue
        when = dt.datetime.fromisoformat(modified.group(1).replace("Z", "+00:00"))
        if newest is None or when > newest[2]:
            newest = (key.group(1), int(size.group(1)), when)
    return newest


def _head_bytes(key: str, count: int = 4096) -> bytes:
    return _request(
        f"/{BUCKET}/{urllib.parse.quote(key, safe='/')}",
        extra_headers={"Range": f"bytes=0-{count - 1}"},
    )


def looks_like_pg_dump(key: str) -> tuple[bool, str]:
    """Fetch and decompress only the first bytes: enough to read the magic."""
    head = _head_bytes(key)
    if head[:2] != b"\x1f\x8b":
        return False, f"not gzip (starts with {head[:4].hex()})"
    try:
        # A 4 KB slice of a gzip stream ends mid-block; that raises EOFError
        # after having produced the bytes we care about, so decompress
        # incrementally and keep whatever came out.
        magic = gzip.decompress(head)[:5]
    except EOFError:
        import zlib

        magic = zlib.decompressobj(31).decompress(head)[:5]
    if magic != b"PGDMP":
        return False, f"gzip, but not a pg_dump archive (starts with {magic!r})"
    return True, "gzip + PGDMP"


def looks_like_tar(key: str) -> tuple[bool, str]:
    """A tar's first 512 bytes are a header block with `ustar` at offset 257.

    The media backup is an uncompressed tar, so this needs no decompression —
    and it is the same question the dump check asks: is the thing in the bucket
    the kind of file the restore command can open, or only the right size.
    """
    head = _head_bytes(key, 512)
    if len(head) < 512:
        return False, f"shorter than one tar header block ({len(head)} bytes)"
    if head[257:262] != b"ustar":
        return False, f"not a tar (offset 257 is {head[257:262]!r})"
    return True, "ustar"


def main() -> int:
    now = dt.datetime.now(dt.timezone.utc)
    failed = False

    verifiers = {"pgdump": looks_like_pg_dump, "tar": looks_like_tar}

    for prefix, min_size, header in CHECKS:
        newest = newest_under(prefix)
        if newest is None:
            print(f"::error::no backup at all under {prefix} in r2://{BUCKET}")
            failed = True
            continue

        key, size, when = newest
        age_hours = (now - when).total_seconds() / 3600
        detail = f"{key}  {size:,} bytes  {age_hours:.1f} h old"

        if age_hours > MAX_AGE_HOURS:
            print(f"::error::{prefix} backup is stale — {detail}")
            failed = True
            continue
        if size < min_size:
            print(f"::error::{prefix} backup is too small to be real — {detail}")
            failed = True
            continue

        if header:
            ok, why = verifiers[header](key)
            if not ok:
                print(f"::error::{prefix} backup is not restorable — {why} — {detail}")
                failed = True
                continue
            detail += f"  [{why}]"

        print(f"ok   {detail}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
