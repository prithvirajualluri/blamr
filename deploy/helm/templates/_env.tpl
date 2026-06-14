{{- define "blamr.api.env" -}}
- name: NODE_ENV
  value: production
- name: DATABASE_URL
  value: {{ include "blamr.databaseUrl" . | quote }}
- name: REDIS_URL
  value: {{ include "blamr.redisUrl" . | quote }}
- name: CLICKHOUSE_URL
  value: {{ include "blamr.clickhouseUrl" . | quote }}
- name: CLICKHOUSE_DATABASE
  value: blamr
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "blamr.secretName" . }}
      key: jwt-secret
{{- end }}

{{- define "blamr.ingest.env" -}}
- name: NODE_ENV
  value: production
- name: DATABASE_URL
  value: {{ include "blamr.databaseUrl" . | quote }}
- name: REDIS_URL
  value: {{ include "blamr.redisUrl" . | quote }}
- name: KAFKA_BROKERS
  value: {{ include "blamr.kafkaBrokers" . | quote }}
- name: BLAMR_INGEST_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "blamr.secretName" . }}
      key: ingest-secret
{{- end }}

{{- define "blamr.workers.env" -}}
- name: NODE_ENV
  value: production
- name: DATABASE_URL
  value: {{ include "blamr.databaseUrl" . | quote }}
- name: REDIS_URL
  value: {{ include "blamr.redisUrl" . | quote }}
- name: KAFKA_BROKERS
  value: {{ include "blamr.kafkaBrokers" . | quote }}
- name: CLICKHOUSE_URL
  value: {{ include "blamr.clickhouseUrl" . | quote }}
- name: CLICKHOUSE_DATABASE
  value: blamr
- name: BLAMR_ML_ENABLED
  value: {{ .Values.workers.env.blamrMlEnabled | quote }}
- name: BLAMR_SEMANTIC_DRIFT
  value: {{ .Values.workers.env.blamrSemanticDrift | quote }}
- name: BLAMR_LLM_BLAME_REASON
  value: {{ .Values.workers.env.blamrLlmBlameReason | quote }}
- name: BLAMR_LLM_BASE_URL
  value: {{ include "blamr.ollamaBaseUrl" . | quote }}
- name: BLAMR_LLM_API_KEY
  value: {{ .Values.workers.env.blamrLlmApiKey | quote }}
- name: BLAMR_EMBEDDING_MODEL
  value: {{ .Values.workers.env.blamrEmbeddingModel | quote }}
- name: BLAMR_LLM_REASON_MODEL
  value: {{ .Values.workers.env.blamrLlmReasonModel | quote }}
{{- end }}

{{- define "blamr.waitInitContainers" -}}
{{- if .Values.clickhouse.enabled }}
- name: wait-clickhouse
  image: curlimages/curl:8.5.0
  command: ["sh", "-c", "until curl -sf {{ include "blamr.clickhouseUrl" . }}/ping; do echo waiting for clickhouse; sleep 3; done"]
{{- end }}
{{- if .Values.ollama.enabled }}
- name: wait-ollama
  image: curlimages/curl:8.5.0
  command: ["sh", "-c", "until curl -sf http://{{ include "blamr.ollama.host" . }}:11434/api/tags; do echo waiting for ollama; sleep 5; done"]
{{- end }}
{{- end }}
