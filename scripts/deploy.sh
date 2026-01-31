#!/bin/bash
# MoltDAO Deployment Script
# Deploys frontend to S3 + CloudFront, backend to App Runner

set -e

echo "🦞 MoltDAO Deployment"
echo "====================="

# Configuration
S3_BUCKET="moltdao-frontend"
CLOUDFRONT_DIST_ID="${CLOUDFRONT_DIST_ID:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    error "AWS CLI not found. Install: brew install awscli"
fi

# Check if logged in
if ! aws sts get-caller-identity &> /dev/null; then
    error "Not logged into AWS. Run: aws configure"
fi

echo ""
echo "Step 1: Deploy Frontend to S3"
echo "------------------------------"

# Create bucket if not exists
if ! aws s3 ls "s3://$S3_BUCKET" 2>&1 | grep -q "bucket"; then
    log "Creating S3 bucket: $S3_BUCKET"
    aws s3 mb "s3://$S3_BUCKET" --region $AWS_REGION
    
    # Enable static website hosting
    aws s3 website "s3://$S3_BUCKET" --index-document index.html --error-document index.html
    
    # Set bucket policy for public read
    aws s3api put-bucket-policy --bucket $S3_BUCKET --policy '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::'$S3_BUCKET'/*"
        }]
    }'
    log "Bucket created and configured"
else
    log "Bucket exists: $S3_BUCKET"
fi

# Sync public folder
log "Syncing public/ to S3..."
aws s3 sync public/ "s3://$S3_BUCKET" --delete \
    --cache-control "max-age=31536000" \
    --exclude "*.html" \
    --exclude "install.sh"

# HTML files with short cache
aws s3 sync public/ "s3://$S3_BUCKET" \
    --exclude "*" \
    --include "*.html" \
    --include "install.sh" \
    --cache-control "max-age=300"

log "Frontend deployed to S3"

# Invalidate CloudFront if configured
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
    echo ""
    echo "Step 2: Invalidate CloudFront Cache"
    echo "------------------------------------"
    aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_DIST_ID \
        --paths "/*" > /dev/null
    log "CloudFront cache invalidated"
else
    warn "CLOUDFRONT_DIST_ID not set, skipping cache invalidation"
fi

echo ""
echo "Step 3: Deploy Backend to App Runner"
echo "-------------------------------------"

# Check if App Runner service exists
SERVICE_NAME="moltdao-api"
if aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" --output text | grep -q "arn:"; then
    log "App Runner service exists, updating..."
    
    # Get service ARN
    SERVICE_ARN=$(aws apprunner list-services \
        --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" \
        --output text)
    
    # Trigger deployment
    aws apprunner start-deployment --service-arn $SERVICE_ARN > /dev/null
    log "Deployment triggered"
else
    warn "App Runner service not found. Create manually or run:"
    echo ""
    echo "  aws apprunner create-service \\"
    echo "    --service-name $SERVICE_NAME \\"
    echo "    --source-configuration file://apprunner-config.json"
fi

echo ""
echo "====================="
echo "🦞 Deployment Complete!"
echo ""
echo "Frontend: https://$S3_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
    echo "CloudFront: Check AWS Console for domain"
fi
echo ""
