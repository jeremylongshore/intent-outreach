#!/usr/bin/env bash
set -euo pipefail
: "${FIRESTORE_LOCATION:=us-central}"
gcloud services enable firestore.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com
gcloud firestore databases create --location="${FIRESTORE_LOCATION}" || true
