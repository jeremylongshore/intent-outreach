#!/bin/bash
ACCESS_TOKEN=$(gcloud auth application-default print-access-token)
echo "Video 3 (One Voice):"
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/pipelinepilot-prod/locations/us-central1/publishers/google/models/veo-3.0-generate-001/operations/54250875-e112-4c62-a5c4-052d136041d7" | jq '.done, .error'

echo ""
echo "Video 5 (The Question):"  
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/pipelinepilot-prod/locations/us-central1/publishers/google/models/veo-3.0-generate-001/operations/4d14773d-2fac-456e-827a-9c1477eff05a" | jq '.done, .error'
