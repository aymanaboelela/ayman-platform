import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/dashboard.dart';
import '../models/dashboard_mapper.dart';

/// The one dashboard call.
class DashboardRemoteDataSource {
  const DashboardRemoteDataSource(this._client);

  final ApiClient _client;

  Future<Result<Dashboard>> dashboard() {
    return _client.get<Dashboard>(
      '/me/dashboard',
      parse: (data) => DashboardMapper.fromJson(data as Map<String, dynamic>),
    );
  }
}
