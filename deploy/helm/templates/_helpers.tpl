{{/*
Expand the name of the chart.
*/}}
{{- define "blamr.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "blamr.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "blamr.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "blamr.labels" -}}
helm.sh/chart: {{ include "blamr.chart" . }}
{{ include "blamr.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "blamr.selectorLabels" -}}
app.kubernetes.io/name: {{ include "blamr.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "blamr.componentLabels" -}}
{{ include "blamr.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "blamr.image" -}}
{{- $repo := .repository -}}
{{- $tag := .tag | default $.Chart.AppVersion -}}
{{- $registry := $.Values.global.imageRegistry -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repo $tag -}}
{{- else -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
{{- end }}

{{- define "blamr.postgresql.host" -}}
{{- if .Values.postgresql.enabled -}}
{{- printf "%s-postgresql" .Release.Name -}}
{{- else -}}
{{- required "external.postgresql.host is required when postgresql.enabled=false" .Values.external.postgresql.host -}}
{{- end -}}
{{- end }}

{{- define "blamr.postgresql.port" -}}
{{- if .Values.postgresql.enabled -}}5432{{- else -}}{{- .Values.external.postgresql.port -}}{{- end -}}
{{- end }}

{{- define "blamr.postgresql.user" -}}
{{- .Values.postgresql.auth.username -}}
{{- end }}

{{- define "blamr.postgresql.password" -}}
{{- .Values.postgresql.auth.password -}}
{{- end }}

{{- define "blamr.postgresql.database" -}}
{{- .Values.postgresql.auth.database -}}
{{- end }}

{{- define "blamr.databaseUrl" -}}
{{- printf "postgresql://%s:%s@%s:%s/%s" (include "blamr.postgresql.user" .) (include "blamr.postgresql.password" .) (include "blamr.postgresql.host" .) (include "blamr.postgresql.port" .) (include "blamr.postgresql.database" .) -}}
{{- end }}

{{- define "blamr.valkey.host" -}}
{{- if .Values.valkey.enabled -}}
{{- if .Values.valkey.serviceHost -}}
{{- .Values.valkey.serviceHost -}}
{{- else -}}
{{- printf "%s-valkey-primary" .Release.Name -}}
{{- end -}}
{{- else -}}
{{- required "external.valkey.host is required when valkey.enabled=false" .Values.external.valkey.host -}}
{{- end -}}
{{- end }}

{{- define "blamr.redisUrl" -}}
{{- printf "redis://%s:%s" (include "blamr.valkey.host" .) (.Values.external.valkey.port | default 6379) -}}
{{- end }}

{{- define "blamr.clickhouse.host" -}}
{{- if .Values.clickhouse.enabled -}}
{{- printf "%s-clickhouse" (include "blamr.fullname" .) -}}
{{- else -}}
{{- required "external.clickhouse.host is required when clickhouse.enabled=false" .Values.external.clickhouse.host -}}
{{- end -}}
{{- end }}

{{- define "blamr.clickhouseUrl" -}}
{{- if .Values.clickhouse.enabled -}}
{{- printf "http://%s:8123" (include "blamr.clickhouse.host" .) -}}
{{- else -}}
{{- .Values.external.clickhouse.url -}}
{{- end -}}
{{- end }}

{{- define "blamr.redpanda.host" -}}
{{- if .Values.redpanda.enabled -}}
{{- printf "%s-redpanda" (include "blamr.fullname" .) -}}
{{- else -}}
{{- required "external.redpanda.host is required when redpanda.enabled=false" .Values.external.redpanda.host -}}
{{- end -}}
{{- end }}

{{- define "blamr.kafkaBrokers" -}}
{{- if .Values.redpanda.enabled -}}
{{- printf "%s:9092" (include "blamr.redpanda.host" .) -}}
{{- else -}}
{{- .Values.external.redpanda.brokers -}}
{{- end -}}
{{- end }}

{{- define "blamr.ollama.host" -}}
{{- if .Values.ollama.enabled -}}
{{- printf "%s-ollama" (include "blamr.fullname" .) -}}
{{- else -}}
{{- required "external.ollama.host is required when ollama.enabled=false" .Values.external.ollama.host -}}
{{- end -}}
{{- end }}

{{- define "blamr.ollamaBaseUrl" -}}
{{- if .Values.ollama.enabled -}}
{{- printf "http://%s:11434/v1" (include "blamr.ollama.host" .) -}}
{{- else -}}
{{- .Values.external.ollama.baseUrl -}}
{{- end -}}
{{- end }}

{{- define "blamr.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else -}}
{{- include "blamr.fullname" . -}}
{{- end -}}
{{- end }}
