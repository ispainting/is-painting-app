# Google Document AI Authentication (No Service Account Keys)

This integration supports Google Application Default Credentials (ADC) and does not require downloading a service account JSON private key.

## Runtime Provider Configuration

Set these environment variables in Vercel Preview/Production as needed:

- `RECEIPT_EXTRACTION_PROVIDER=google_document_ai`
- `RECEIPT_EXTRACTION_ENABLED=true`
- `GOOGLE_DOCUMENT_AI_PROJECT_ID=620122133023`
- `GOOGLE_DOCUMENT_AI_LOCATION=us`
- `GOOGLE_DOCUMENT_AI_PROCESSOR_ID=6f70adf3499fb489`
- Optional: `GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION_ID=<version-id>`

## Recommended Production Authentication (Keyless)

Google-recommended secure method is Workload Identity Federation (WIF) with ADC:

1. Create a Workload Identity Pool and OIDC Provider in Google Cloud IAM.
2. Grant a Google service account access to Document AI roles needed by your processor.
3. Allow federated principals from the pool/provider to impersonate that service account.
4. Use an external account credential configuration (not a private key) and provide it to the app via ADC.

This app supports loading the external account config from:

- `GOOGLE_APPLICATION_CREDENTIALS` (path in runtime), or
- `GOOGLE_EXTERNAL_ACCOUNT_CONFIG_JSON` (JSON content injected as env var and written to `/tmp` at runtime).

The external account config is not a downloadable private key and is compatible with Secure-by-Default org policies that block service account key creation.

## Vercel Compatibility Note

If your Vercel runtime setup can provide an OIDC subject token source compatible with Google external account credentials, use WIF directly end-to-end.

If direct runtime OIDC federation is not available in your Vercel setup, the best secure alternative is:

1. Run a small extraction broker in Google Cloud Run.
2. Cloud Run uses native Google service account identity (keyless) to call Document AI.
3. Vercel calls the broker over HTTPS with strict auth (signed JWT or mTLS/IAP pattern).

This keeps Google credentials keyless and avoids service account private key files entirely.

## Roles (minimum guidance)

Grant only least-privilege roles required, typically including Document AI API usage on the target project/processor and service account token creation for impersonation where applicable.

Validate exact IAM bindings in your security baseline.
