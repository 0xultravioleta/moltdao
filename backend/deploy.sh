#!/bin/bash
# MoltDAO Backend Deployment Script
# Deploys Lambda + DynamoDB + API Gateway via SAM

set -e

echo "🦞 MoltDAO Backend Deployment"
echo "=============================="

# Configuration
STACK_NAME="moltdao-backend"
S3_BUCKET="moltdao-sam-deployments"
REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-production}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Check SAM CLI
if ! command -v sam &> /dev/null; then
    error "SAM CLI not found. Install: brew install aws-sam-cli"
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    error "Not logged into AWS. Run: aws configure"
fi

cd "$(dirname "$0")"

echo ""
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Step 1: Create S3 bucket if needed
echo "Step 1: Checking S3 bucket..."
if ! aws s3 ls "s3://$S3_BUCKET" 2>&1 | grep -q "bucket"; then
    log "Creating S3 bucket: $S3_BUCKET"
    aws s3 mb "s3://$S3_BUCKET" --region $REGION
else
    log "S3 bucket exists: $S3_BUCKET"
fi

# Step 2: Install dependencies
echo ""
echo "Step 2: Installing dependencies..."
cd functions
npm install --production
cd ..
log "Dependencies installed"

# Step 3: Build
echo ""
echo "Step 3: Building SAM application..."
sam build
log "Build complete"

# Step 4: Deploy
echo ""
echo "Step 4: Deploying to AWS..."
sam deploy \
    --stack-name "$STACK_NAME-$ENVIRONMENT" \
    --s3-bucket "$S3_BUCKET" \
    --s3-prefix "$STACK_NAME" \
    --region "$REGION" \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides Environment=$ENVIRONMENT \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

log "Deployment complete!"

# Step 5: Get outputs
echo ""
echo "Step 5: Stack Outputs"
echo "====================="
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME-$ENVIRONMENT" \
    --query "Stacks[0].Outputs" \
    --output table

echo ""
echo "🦞 Backend deployed successfully!"
