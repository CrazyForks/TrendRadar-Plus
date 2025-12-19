# Deployment Configuration

## Production Server

### Server Information
- **Host**: 120.77.222.205
- **User**: root
- **SSH Port**: 52222
- **Project Path**: ~/hotnews
- **SSH Config Alias**: (optional) `trendradar-prod`

### Deployment Method
- **Primary**: Git pull + service restart
- **Backup**: rsync for quick fixes

### Service Management
```bash
# Check service status
systemctl status trendradar  # if using systemd
# or
docker-compose ps            # if using docker

# View logs
journalctl -u trendradar -f  # systemd
docker-compose logs -f       # docker
tail -f ~/hotnews/logs/*.log # direct python
```

### Quick Deploy Commands

#### Git-based Deployment (Recommended)
```bash
ssh -p 52222 root@120.77.222.205 'cd ~/hotnews && git pull && systemctl restart trendradar'
```

#### Docker Deployment
```bash
ssh -p 52222 root@120.77.222.205 'cd ~/hotnews && git pull && cd docker && docker-compose restart trend-radar'
```

#### Direct File Sync (Hot Fix Only)
```bash
# Sync single file
rsync -avz -e "ssh -p 52222" trendradar/web/server.py root@120.77.222.205:~/hotnews/trendradar/web/

# Restart service
ssh -p 52222 root@120.77.222.205 'systemctl restart trendradar'
```

## Testing Endpoints

After deployment, verify:
```bash
# Health check
curl http://120.77.222.205:8080/health

# Test Chinese encoding fix
curl http://120.77.222.205:8080/api/news | python3 -m json.tool | grep -A 2 "掘金"

# Web interface
open http://120.77.222.205:8080/viewer
```

## Rollback Procedure

If deployment fails:
```bash
ssh -p 52222 root@120.77.222.205 'cd ~/hotnews && git reset --hard HEAD~1 && systemctl restart trendradar'
```

## Security Notes
- SSH key authentication required
- Firewall: only ports 22, 8080 exposed
- Regular security updates via `apt update && apt upgrade`

## Maintenance

### Backup Schedule
- Database: Daily at 2:00 AM (cron)
- Configuration: Weekly backup to S3

### Log Rotation
- Logs older than 30 days auto-deleted
- Max log size: 100MB per file

## Related Documentation
- [Setup Guide](../README.md)
- [Configuration](../config/config.yaml)
- [Docker Setup](../docker/README.md)
