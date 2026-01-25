# Start Development Environment

Start all infrastructure services and the frontend dev server.

```bash
# Start Docker services
docker compose up -d

# Wait for services to be ready
echo "Waiting for services..."
sleep 5

# Check service health
docker compose ps

# Show useful URLs
echo ""
echo "Services ready:"
echo "  Frontend:         http://localhost:3000"
echo "  Redpanda Console: http://localhost:8080"
echo "  ClickHouse:       http://localhost:8123/play"
echo "  Redis:            localhost:6379"
echo ""
echo "To start frontend: cd frontend && npm run dev"
echo "To start producer: cd producer && source venv/bin/activate && python main.py"
```
