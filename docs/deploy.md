# Deploying to AWS

**Nothing in this repo has been run against AWS.** Devin's rule (2026-10-27): no AWS action of any
kind until he says so, and never with his own credentials (those are for the company account).
Everything below is the plan for when he gives the go-ahead and says which account to use.

## What runs where

| Piece | AWS | Notes |
|---|---|---|
| App (API + UI in one jar) | Elastic Beanstalk, Java SE platform (Corretto 17), single t4g.nano | `SPRING_PROFILES_ACTIVE=aws`, port 5000; small JVM settings in the Procfile and a 1 GB swap file (Devin wanted the smallest instance, 2026-11-01) |
| Table | `financial-tracker`, us-east-1, on-demand, point-in-time recovery on | created 2026-11-01 |
| Data | DynamoDB table `financial-tracker` | on-demand billing; one table for everyone |
| HTTPS | CloudFront distribution in front of Beanstalk | free `https://<id>.cloudfront.net` address (Devin, 2026-11-01); a real domain can come later |
| Sign-in | Google OAuth client (Google Cloud console) | only emails in `ALLOWED_EMAILS` get in |
| App bundles | S3 (Beanstalk's own bucket) | backups/exports bucket comes later |

## Run it locally first (no AWS)

```bash
./gradlew :backend:dynamoDbLocal                                   # terminal 1: DynamoDB Local on :8000, in memory
./gradlew :backend:bootRun --args='--spring.profiles.active=local-dynamodb'   # terminal 2
```

The `local-dynamodb` profile points at `http://localhost:8000` with dummy credentials, so it can't
reach a real AWS account. Without the profile, data stays in memory as before.

To try Google sign-in locally, add the Google client details (below) and run with
`--finance.auth.mode=google --finance.auth.allowed-emails=you@gmail.com` plus the three
`spring.security.oauth2.client.registration.google.*` settings from the `aws` profile in
`application.yml`. Google allows `http://localhost:8080/login/oauth2/code/google` as a redirect URI.

## Build the bundle

```bash
./gradlew :backend:beanstalkBundle
# -> backend/build/distributions/financial-tracker-beanstalk.zip (jar + Procfile + .ebextensions)
```

## One-time setup (when Devin says go)

AWS commands run on Devin's computer (Remote Control) with `--profile personal` on every command.
His default profile is a work account: never use it.

1. **DynamoDB table** (region of choice, e.g. us-east-1):
   ```bash
   aws dynamodb create-table --table-name financial-tracker \
     --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
     --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
     --billing-mode PAY_PER_REQUEST
   aws dynamodb update-continuous-backups --table-name financial-tracker \
     --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
   ```
2. **IAM**: add `deploy/iam-dynamodb-policy.json` to the Beanstalk instance profile
   (`aws-elasticbeanstalk-ec2-role`), so the app reaches the table without any keys.
3. **HTTPS** (chosen 2026-11-01: CloudFront's free address). Google only redirects to `https://` (or
   localhost). Beanstalk runs as a single instance (no load balancer) and a CloudFront distribution sits
   in front: origin = the environment's `*.elasticbeanstalk.com` address over HTTP, viewer protocol
   "redirect HTTP to HTTPS", all methods allowed, cache policy `CachingDisabled`, origin request policy
   `AllViewerExceptHostHeader` (forwards cookies, query strings and the CSRF header). Set `PUBLIC_URL` to
   the `https://<id>.cloudfront.net` address. Later: limit the instance's security group to CloudFront's
   managed prefix list so the plain-HTTP Beanstalk address isn't reachable directly.
4. **Google OAuth client**: Google Cloud console → APIs & Services → Credentials → OAuth client ID,
   type Web application. Authorized redirect URI: `<PUBLIC_URL>/login/oauth2/code/google`.
   Consent screen: External, in testing mode, Devin as a test user is enough.
5. **Beanstalk**: create the application and an environment on "Corretto 17 running on 64bit Amazon Linux 2023",
   upload the bundle, and set these environment properties (secrets live only here):
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ALLOWED_EMAILS` (comma separated)
   - `PUBLIC_URL` (the CloudFront `https://` address, no trailing slash)
   - `FINANCE_TABLE_NAME` if the table isn't called `financial-tracker`
6. **First sign-in** starts from the sample data. Import the real sheets from the profile
   (Import & export), which replaces it.

## Updating

Build the bundle, upload it as a new application version, deploy it. Sessions are in memory, so a
deploy signs everyone out; data is in DynamoDB and survives.
