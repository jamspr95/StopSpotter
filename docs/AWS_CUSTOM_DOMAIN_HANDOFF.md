# StopSpotter — AWS custom domain handoff (S3 + CloudFront)

> For whoever sets this up (your AWS-side dev). Everything here assumes
> `airestop.co.uk` is already a Route 53 hosted zone in your AWS account —
> nothing in this doc touches any DNS record other than adding one new
> `nextstop.airestop.co.uk` record.

## What this gets you

`https://nextstop.airestop.co.uk/stopspotter` serving the StopSpotter app,
deployed automatically on every push to `main` via GitHub Actions — no
Cloudflare involved in production at all. (Cloudflare Workers hosting from
`docs/CLOUDFLARE_MIGRATION_PLAN.md` stays live at
`stopspotter.stopspotter.workers.dev` as a free dev/preview URL — nothing
here changes or depends on it.)

The `/stopspotter` path (not the domain root) is deliberate — the app is
built with its asset paths rooted at `/stopspotter/`, so this bucket/
distribution can host sibling apps at other paths later without conflict.

## Already done in the repo

- `npm run build:aws` — builds with `--base=/stopspotter/` so every asset
  path, and the client-side router's basename, resolve correctly when
  served from that path (same mechanism already used for GitHub Pages'
  `/StopSpotter/` subpath — see `vite.config.ts` / `src/main.tsx`).
- `.github/workflows/deploy-aws.yml` — builds and syncs to S3, then
  invalidates CloudFront, on every push to `main`. Needs the AWS resources
  and repo variables below before it'll succeed.
- `infra/aws/stopspotter-spa-fallback.js` — a CloudFront Function that
  serves the SPA shell for any client-side route (e.g.
  `/stopspotter/stop/abc123`) that isn't a real file in the bucket. Scoped
  to the `/stopspotter/*` behavior only, so it won't interfere with
  anything else you later add to this distribution.

## What you need to set up, in order

### 1. S3 bucket

A private bucket (no public access, no static website hosting mode —
CloudFront reads it via Origin Access Control, not as a public website).
Can be new or an existing bucket you already use for other static sites;
this deploy only ever touches the `stopspotter/` prefix inside it.

```bash
aws s3api create-bucket \
  --bucket <YOUR_BUCKET_NAME> \
  --region <YOUR_REGION> \
  --create-bucket-configuration LocationConstraint=<YOUR_REGION>
aws s3api put-public-access-block \
  --bucket <YOUR_BUCKET_NAME> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 2. ACM certificate (us-east-1 — required for CloudFront regardless of
   where the bucket lives)

```bash
aws acm request-certificate \
  --domain-name nextstop.airestop.co.uk \
  --validation-method DNS \
  --region us-east-1
```

Take the `CNAME` validation record ACM gives you and add it in Route 53
(same hosted zone as `airestop.co.uk`). Wait for the certificate status to
become `ISSUED` before continuing (`aws acm describe-certificate --region
us-east-1 --certificate-arn <arn>`).

### 3. CloudFront Function (SPA fallback)

Dashboard: **CloudFront → Functions → Create function** → name it
`stopspotter-spa-fallback` → paste in `infra/aws/stopspotter-spa-fallback.js`
→ **Save** → **Publish**.

### 4. CloudFront distribution

- **Origin**: the S3 bucket from step 1, via **Origin Access Control**
  (CloudFront's console offers to create the OAC and update the bucket
  policy for you when you pick "S3" as the origin type and select the
  bucket — accept that).
- **Alternate domain name (CNAME)**: `nextstop.airestop.co.uk`
- **Custom SSL certificate**: the ACM cert from step 2
- **Default root object**: `stopspotter/index.html` (only matters if
  someone hits the bare domain root; the real app lives under
  `/stopspotter/`)
- **Behaviors**:
  - Add a behavior for path pattern `/stopspotter/*`:
    - Viewer protocol policy: Redirect HTTP to HTTPS
    - Allowed methods: GET, HEAD, OPTIONS
    - Compress objects automatically: Yes
    - Function associations → **Viewer request** → the
      `stopspotter-spa-fallback` function from step 3
  - Leave the default (`*`) behavior pointed at the same origin with no
    function attached, or `404 Not Found` on your own origin config if you'd
    rather the bare domain root 404 until a sibling app is added — either
    is fine for now.

If the console created an OAC bucket policy for you, confirm it looks like
this (it scopes read access to *this* distribution specifically, not to
CloudFront in general):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<YOUR_BUCKET_NAME>/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

### 5. Route 53

Add an **A (Alias)** record — and an **AAAA (Alias)** record if you want
IPv6 — for `nextstop.airestop.co.uk` pointing at the CloudFront
distribution (Route 53's console offers "Alias to CloudFront
distribution" directly, no IP address needed).

### 6. GitHub Actions → AWS auth (OIDC, no long-lived keys)

One-time, if this account doesn't already have a GitHub OIDC identity
provider (check **IAM → Identity providers** first). AWS now validates
GitHub's certificate against trusted root CAs rather than relying on the
thumbprint, so create it without one — don't hard-code a thumbprint value
here, they're known to go stale:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

If your AWS CLI version still requires `--thumbprint-list` as a mandatory
flag, get the current value straight from GitHub's certificate rather than
copying one from a blog post:

```bash
openssl s_client -connect token.actions.githubusercontent.com:443 -servername token.actions.githubusercontent.com < /dev/null 2>/dev/null \
  | openssl x509 -fingerprint -sha1 -noout | cut -d= -f2 | tr -d ':'
```

Create a role trusted by that provider, scoped to this repo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:jamspr95/StopSpotter:ref:refs/heads/main" }
      }
    }
  ]
}
```

Attach a permissions policy scoped narrowly to this one deploy (replace
the placeholders):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<YOUR_BUCKET_NAME>",
        "arn:aws:s3:::<YOUR_BUCKET_NAME>/stopspotter/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

### 7. Add repo variables

GitHub repo → **Settings → Secrets and variables → Actions → Variables
tab** (none of these are secret — they're ARNs/IDs, not credentials, same
reasoning as `CLOUDFLARE_ACCOUNT_ID`):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | the role ARN from step 6 |
| `AWS_REGION` | the region you created the S3 bucket in (step 1) |
| `AWS_S3_BUCKET` | the bucket name from step 1 |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | the distribution ID from step 4 |

(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`
should already exist as repo **secrets** from the Cloudflare/GitHub Pages
setup — `deploy-aws.yml` reuses them, nothing new needed there.)

### 8. Deploy

Push to `main`, or run **Actions → "Deploy to AWS (S3 + CloudFront)" → Run
workflow** manually. First run can take a few minutes for CloudFront to
propagate.

### 9. Supabase Auth redirect URL

Add `https://nextstop.airestop.co.uk/stopspotter/spot/signup` to Supabase's
allowed redirect URLs (`docs/SETUP.md` §5 — Authentication → URL
Configuration → Redirect URLs in the Supabase dashboard), or magic-link
sign-in will fail on this domain.

## Verification checklist

- [ ] `https://nextstop.airestop.co.uk/stopspotter` loads the app
- [ ] A direct load of a client-side route (e.g.
      `https://nextstop.airestop.co.uk/stopspotter/stop/<some-id>`) also
      loads correctly, not a CloudFront/S3 error page — confirms the
      CloudFront Function is attached and working
- [ ] The map shows real nomination data (confirms Supabase env vars made
      it into this build)
- [ ] Magic-link sign-in completes and returns to the app (confirms the
      Supabase redirect URL from step 9)
- [ ] `nextstop.airestop.co.uk`'s existing/future sibling records
      (`airestop.co.uk`'s MX/SPF/DKIM for Brevo, etc.) are unaffected —
      this setup only ever touched `nextstop.airestop.co.uk` itself
