# AutoGen Adapter

## Usage

Requires blamr ingest running and `BLAMR_API_KEY`. See [docs/INSTALL.md](../../docs/INSTALL.md).

```python
from blamr.adapters.autogen import BlamrCallbacks

callbacks = BlamrCallbacks(workflow_id="incident-triage")
callbacks.start_run()

# Pass to AutoGen agent config
agent = AssistantAgent(..., callbacks=[callbacks])
```
