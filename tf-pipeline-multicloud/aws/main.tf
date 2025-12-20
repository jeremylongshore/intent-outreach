# PipelinePilot AWS Infrastructure
# Equivalent to GCP Firebase + Vertex AI setup

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # backend "s3" {
  #   bucket = "pipelinepilot-terraform-state"
  #   key    = "terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.region
}

# S3 Bucket for Dashboard Hosting
resource "aws_s3_bucket" "dashboard" {
  bucket = var.dashboard_bucket_name

  tags = merge(var.tags, {
    Name = "pipelinepilot-dashboard"
  })
}

resource "aws_s3_bucket_website_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"  # SPA routing
  }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "dashboard_public_read" {
  bucket = aws_s3_bucket.dashboard.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.dashboard.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.dashboard]
}

# CloudFront Distribution for CDN
resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  origin {
    domain_name = aws_s3_bucket_website_configuration.dashboard.website_endpoint
    origin_id   = "S3-${var.dashboard_bucket_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.dashboard_bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = var.tags
}

# IAM Role for Lambda Functions
resource "aws_iam_role" "lambda_role" {
  name = "pipelinepilot-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Attach policies to Lambda role
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_role.name
}

resource "aws_iam_role_policy_attachment" "lambda_bedrock" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonBedrockFullAccess"
  role       = aws_iam_role.lambda_role.name
}

# DynamoDB Table for Campaign Logs
resource "aws_dynamodb_table" "campaigns" {
  name           = "pipelinepilot-campaigns"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "campaignId"
  range_key      = "timestamp"

  attribute {
    name = "campaignId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  tags = var.tags
}

# Secrets Manager for API Keys
resource "aws_secretsmanager_secret" "orchestrator_id" {
  name = "ORCHESTRATOR_DEV_ID"

  tags = var.tags
}

resource "aws_secretsmanager_secret" "external_api_keys" {
  for_each = toset(var.external_api_secrets)

  name = each.key

  tags = var.tags
}

# S3 Bucket for Lambda Code & Agent Staging
resource "aws_s3_bucket" "lambda_staging" {
  bucket = var.staging_bucket_name

  tags = merge(var.tags, {
    Name = "pipelinepilot-lambda-staging"
  })
}

resource "aws_s3_bucket_versioning" "lambda_staging" {
  bucket = aws_s3_bucket.lambda_staging.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Grant Lambda role access to DynamoDB
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "pipelinepilot-lambda-dynamodb"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = aws_dynamodb_table.campaigns.arn
      }
    ]
  })
}

# Grant Lambda role access to Secrets Manager
resource "aws_iam_role_policy" "lambda_secrets" {
  name = "pipelinepilot-lambda-secrets"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.orchestrator_id.arn,
          "${aws_secretsmanager_secret.external_api_keys["CLAY_API_KEY"].arn}*"
        ]
      }
    ]
  })
}
