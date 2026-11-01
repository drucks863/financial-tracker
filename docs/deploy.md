# Deploying to AWS

Hosting is **AWS Lambda** behind CloudFront, chosen 2026-11-01 to stay under $5/month (an always-on
server was ~$7+ once the public IPv4 charge is counted). Expected cost at personal traffic: about $0–1/month.

AWS commands run on Devin's computer (Remote Control) with `--profile personal --region us-east-1` on every
command, signed in as the IAM user `drucks`, never root. His default profile is a work account: never use it.

## What runs where

| Piece | AWS | Notes |
|---|---|---|
| App (API + UI) | Lambda `financial-tracker`, Java 21 runtime, arm64, 1024 MB, SnapStart | handler `app.financetracker.LambdaHandler`, alias `live`, function URL on the alias |
| HTTPS | CloudFront distribution in front of the function URL | free `https://<id>.cloudfront.net` address; a real domain can come later |
| Data + sessions | DynamoDB table `financial-tracker` (us-east-1, on-demand, point-in-time recovery) | created 2026-11-01; sign-in sessions are `SESSION#` items, TTL attribute `expiresAt` |
| Sign-in | Google OAuth client (Google Cloud console) | only emails in `ALLOWED_EMAILS` get in |
| Code bundles | S3 bucket `financial-tracker-deploy-<account id>` | the Lambda zip is uploaded here |

## Run it locally (no AWS)

```bash
./gradlew :backend:dynamoDbLocal                                   # terminal 1: DynamoDB Local on :8000, in memory
./gradlew :backend:bootRun --args='--spring.profiles.active=local-dynamodb'   # terminal 2
```

Locally the app still runs on Tomcat; only Lambda uses `LambdaHandler`. `LambdaHandlerTest` feeds the
handler function URL events, so the Lambda path is tested without AWS.

## Build

```bash
./gradlew :backend:lambdaZip
# -> backend/build/distributions/financial-tracker-lambda.zip (classes + UI at the root, jars in lib/)
```

## One-time setup

1. **Table** (done): `pk`/`sk` strings, on-demand, point-in-time recovery. Turn on TTL:
   `aws dynamodb update-time-to-live --table-name financial-tracker --time-to-live-specification Enabled=true,AttributeName=expiresAt`
2. **Execution role** `financial-tracker-lambda`: trusted by `lambda.amazonaws.com`, managed policy
   `AWSLambdaBasicExecutionRole` (logs), inline policy from `deploy/iam-dynamodb-policy.json` (this table only).
3. **Deploy bucket** `financial-tracker-deploy-<account id>`, private, upload the zip.
4. **Function**: runtime `java21`, architecture `arm64`, memory 1024 MB, timeout 30 s, handler
   `app.financetracker.LambdaHandler`, SnapStart `ApplyOn=PublishedVersions`, environment:
   - `SPRING_PROFILES_ACTIVE=aws`, `FINANCE_TABLE_NAME=financial-tracker`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS` (comma separated), `PUBLIC_URL`
     (the CloudFront `https://` address, no trailing slash); placeholders until the Google client exists
   - `JAVA_TOOL_OPTIONS=-XX:+TieredCompilation -XX:TieredStopAtLevel=1` (faster cold start)

   Publish a version, point alias `live` at it, create a function URL on `live` with auth type `NONE`
   and allow public invokes (`lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` via the function URL).
   The app itself requires Google sign-in for everything but `/actuator/health`.
5. **CloudFront**: origin = the function URL's host, HTTPS only; viewer protocol redirect-to-https;
   all methods; cache policy `Managed-CachingDisabled`; origin request policy
   `Managed-AllViewerExceptHostHeader`. No CloudFront Function: the app takes its public address from
   `PUBLIC_URL` (`security/PublicUrlFilter`), not from X-Forwarded-* headers, which Spring's forwarded-header
   filter turned into 400s on Lambda. Then set `PUBLIC_URL` on the function and publish a new version.
6. **Google OAuth client**: Google Cloud console → APIs & Services → Credentials → OAuth client ID,
   type Web application. Authorized redirect URI: `<PUBLIC_URL>/login/oauth2/code/google`.
   Consent screen: External, testing mode, the allowed accounts as test users.
7. **First sign-in** starts from the sample data. Import the real sheets from the profile
   (Import & export), which replaces it.

## Updating

Build the zip, upload it, `update-function-code`, wait, `publish-version`, move alias `live` to the new
version. Environment variable changes also need a new published version (SnapStart snapshots per version).
Sessions are in DynamoDB, so a deploy doesn't sign anyone out.
