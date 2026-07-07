#!/usr/bin/env bash
#
# vanity-grind-deploy.sh — build the batch vanity grinder image and run it on
# cheap GCP SPOT CPU to grind premium inventory.
#
# Two runners:
#   (default) Cloud Run Job  — simplest; one spot-billed job, scale --tasks for
#                              parallel shards, --cpu for cores per task.
#   --mig                    — GCE spot managed instance group; max cores/$ for
#                              very large runs. Each VM takes a SHARD_INDEX.
#
# Durable output: pass WRITE_DB=1 (+ DATABASE_URL secret) to write sealed keys
# straight into vanity_inventory. Otherwise the job writes an encrypted JSONL to
# /tmp (ephemeral) — fine for a smoke run, not for real inventory.
#
# Idempotent. Prereqs: prompt 01 (project + billing), and for real inventory,
# scripts/gcp/vanity-kms-setup.sh (KMS) — set VANITY_KMS_KEY below.
#
# Usage:
#   PROJECT_ID=my-proj ./scripts/gcp/vanity-grind-deploy.sh
#   PROJECT_ID=my-proj TASKS=8 CPU=8 ./scripts/gcp/vanity-grind-deploy.sh --run
#   PROJECT_ID=my-proj ./scripts/gcp/vanity-grind-deploy.sh --mig --instances 20
#
# Env:
#   PROJECT_ID   required
#   REGION       default us-central1
#   REPO         default containers          (Artifact Registry repo)
#   IMAGE        default vanity-grinder
#   JOB          default vanity-grinder
#   TASKS        default 4                    (Cloud Run Job parallel shards)
#   CPU          default 4                    (vCPU per task; MEM scales with it)
#   INSTANCES    default 10                   (--mig VM count)
#   MACHINE      default c2d-highcpu-8        (--mig machine type)
#   Secrets expected in Secret Manager: WALLET_ENCRYPTION_KEY, JWT_SECRET, and
#   (if WRITE_DB=1) DATABASE_URL. VANITY_KMS_KEY passed as a plain env.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to your GCP project}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-containers}"
IMAGE="${IMAGE:-vanity-grinder}"
JOB="${JOB:-vanity-grinder}"
TASKS="${TASKS:-4}"
CPU="${CPU:-4}"
INSTANCES="${INSTANCES:-10}"
MACHINE="${MACHINE:-c2d-highcpu-8}"
GRINDER_SA="${GRINDER_SA:-vanity-grinder@${PROJECT_ID}.iam.gserviceaccount.com}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

MODE="run-job"
DO_RUN=0
INSTANCE_COUNT="$INSTANCES"
for arg in "$@"; do
	case "$arg" in
		--mig) MODE="mig" ;;
		--run) DO_RUN=1 ;;
		--instances) shift; INSTANCE_COUNT="${1:-$INSTANCES}" ;;
	esac
done

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest"

echo "▸ Enabling APIs (run, compute, artifactregistry, cloudbuild)…"
gcloud services enable run.googleapis.com compute.googleapis.com \
	artifactregistry.googleapis.com cloudbuild.googleapis.com --project "$PROJECT_ID"

echo "▸ Artifact Registry repo $REPO…"
gcloud artifacts repositories create "$REPO" --repository-format docker \
	--location "$REGION" --project "$PROJECT_ID" 2>/dev/null || echo "  (repo exists)"

echo "▸ Grinder service account $GRINDER_SA…"
gcloud iam service-accounts create vanity-grinder --display-name "Vanity batch grinder" \
	--project "$PROJECT_ID" 2>/dev/null || echo "  (SA exists)"

echo "▸ Building + pushing image (build context = repo root)…"
gcloud builds submit --project "$PROJECT_ID" --region "$REGION" \
	--tag "$IMAGE_URI" \
	--config <(cat <<YAML
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build','-f','workers/vanity-grinder/Dockerfile','-t','${IMAGE_URI}','.']
images: ['${IMAGE_URI}']
YAML
)

# Common env for the grinder. WRITE_DB/VANITY_KMS_KEY flow through from the shell.
JOB_ENV="RUNNER=cloud-run-job,INCLUDE_5=${INCLUDE_5:-0},IGNORE_CASE=${IGNORE_CASE:-0},WRITE_DB=${WRITE_DB:-1},VANITY_KMS_KEY=${VANITY_KMS_KEY:-}"
JOB_SECRETS="WALLET_ENCRYPTION_KEY=WALLET_ENCRYPTION_KEY:latest,JWT_SECRET=JWT_SECRET:latest,DATABASE_URL=DATABASE_URL:latest"

if [[ "$MODE" == "run-job" ]]; then
	echo "▸ Creating/updating Cloud Run Job $JOB (spot, ${TASKS} tasks × ${CPU} vCPU)…"
	MEM="$(( CPU * 512 ))Mi"
	gcloud run jobs deploy "$JOB" \
		--image "$IMAGE_URI" --region "$REGION" --project "$PROJECT_ID" \
		--service-account "$GRINDER_SA" \
		--cpu "$CPU" --memory "$MEM" \
		--tasks "$TASKS" --parallelism "$TASKS" \
		--max-retries 3 --task-timeout 3600 \
		--set-env-vars "$JOB_ENV,SHARD_COUNT=${TASKS}" \
		--update-secrets "$JOB_SECRETS" \
		--execution-environment gen2 \
		--labels "workload=vanity-grinder,billing=spot"
	# Cloud Run Jobs are spot-eligible via the tasks' preemptible scheduling; each
	# task derives SHARD_INDEX from CLOUD_RUN_TASK_INDEX at runtime (see note below).
	echo "  ✅ Job deployed: $JOB"
	if [[ "$DO_RUN" == "1" ]]; then
		echo "▸ Executing job…"
		gcloud run jobs execute "$JOB" --region "$REGION" --project "$PROJECT_ID" --wait
	else
		echo "  Run it:  gcloud run jobs execute $JOB --region $REGION"
	fi
else
	echo "▸ Creating spot MIG template + group (${INSTANCE_COUNT} × ${MACHINE})…"
	TEMPLATE="${JOB}-tmpl"
	gcloud compute instance-templates create-with-container "$TEMPLATE" \
		--project "$PROJECT_ID" --machine-type "$MACHINE" \
		--provisioning-model SPOT --instance-termination-action DELETE \
		--container-image "$IMAGE_URI" \
		--container-env "RUNNER=gce-spot-mig,SHARD_COUNT=${INSTANCE_COUNT},WRITE_DB=${WRITE_DB:-1},VANITY_KMS_KEY=${VANITY_KMS_KEY:-}" \
		--service-account "$GRINDER_SA" \
		--scopes cloud-platform 2>/dev/null || echo "  (template exists)"
	gcloud compute instance-groups managed create "$JOB" \
		--project "$PROJECT_ID" --zone "${REGION}-a" \
		--template "$TEMPLATE" --size "$INSTANCE_COUNT" 2>/dev/null || echo "  (MIG exists)"
	echo "  ✅ Spot MIG up. Each VM must read SHARD_INDEX from its instance name ordinal."
	echo "  Tear down when done:  gcloud compute instance-groups managed delete $JOB --zone ${REGION}-a"
fi

cat <<EOF

Notes:
  • Cloud Run Jobs: each task auto-shards — the grinder reads CLOUD_RUN_TASK_INDEX
    as its SHARD_INDEX, so TASKS parallel tasks split the target list evenly.
  • Cost: c2d spot ≈ \$0.01–0.02 / vCPU-hour. At ~25k keys/sec/vCPU a 4‑char
    address (~11.3M expected) is ~450 vCPU-seconds ≈ \$0.002. Even 5‑char (~656M)
    is a few cents. See docs/gcp-credits.md for the measured \$/address table.
  • Always run scripts/gcp/vanity-kms-setup.sh first for production inventory so
    keys are sealed under KMS, not just secret-box.
EOF
