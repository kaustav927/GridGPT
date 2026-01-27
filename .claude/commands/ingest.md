# Manual IESO Data Ingestion

Trigger a one-time fetch of IESO data for testing.

```bash

# if cloned from the repo, run this to activate the virtual environment:
# Create new venv
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

#if not already in the producer directory, cd into it
cd producer
source venv/bin/activate

# Run single fetch (all reports)
python -c "
import asyncio
from main import fetch_all_reports
asyncio.run(fetch_all_reports())
print('Ingestion complete!')
"
```

## Test individual parsers

```bash
# Test zonal prices parser
python -c "
import asyncio
from parsers.zonal_prices import fetch_zonal_prices
data = asyncio.run(fetch_zonal_prices())
print(f'Fetched {len(data)} price records')
for d in data[:3]: print(d)
"

# Test zonal demand parser
python -c "
import asyncio
from parsers.zonal_demand import fetch_zonal_demand
data = asyncio.run(fetch_zonal_demand())
print(f'Fetched {len(data)} demand records')
for d in data[:3]: print(d)
"
```
