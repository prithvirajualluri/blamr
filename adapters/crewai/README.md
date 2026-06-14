# CrewAI Adapter

## Usage

```python
from blamr.adapters.crewai import blamr_crew
from crewai import Crew

@blamr_crew(workflow_id="research-assistant")
class ResearchCrew(Crew):
    ...
```

The decorator wraps `kickoff()` to automatically trace all agent handoffs.

Requires blamr ingest and `BLAMR_API_KEY`. See [docs/INSTALL.md](../../docs/INSTALL.md).
