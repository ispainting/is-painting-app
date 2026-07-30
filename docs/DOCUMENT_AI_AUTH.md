# Google Document AI Authentication (Direct Vercel OIDC -> Google WIF)

This integration uses the official Vercel OIDC flow with Google Workload Identity Federation and service account impersonation.

No service account JSON private key is required.

## Runtime Provider Configuration

Set these environment variables in Vercel Preview/Production as needed:

- `RECEIPT_EXTRACTION_PROVIDER=google_document_ai`
- `RECEIPT_EXTRACTION_ENABLED=true`
- `GOOGLE_DOCUMENT_AI_LOCATION=us`
- `GOOGLE_DOCUMENT_AI_PROCESSOR_ID=6f70adf3499fb489`
- Optional: `GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION_ID=<version-id>`

## Official Vercel OIDC -> GCP Variables

Set these values for the OIDC federation flow:

- `GCP_PROJECT_ID=project-46d21ab8-fbfe-427e-965`
- `GCP_PROJECT_NUMBER=620122133023`
- `GCP_SERVICE_ACCOUNT_EMAIL=is-painting-document-ai@project-46d21ab8-fbfe-427e-965.iam.gserviceaccount.com`
- `GCP_WORKLOAD_IDENTITY_POOL_ID=vercel`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel`
- `VERCEL_OIDC_AUDIENCE=https://iam.googleapis.com/projects/620122133023/locations/global/workloadIdentityPools/vercel/providers/vercel`
- `GOOGLE_STS_AUDIENCE=//iam.googleapis.com/projects/620122133023/locations/global/workloadIdentityPools/vercel/providers/vercel`

The provider uses `@vercel/oidc` to obtain a runtime OIDC token using `VERCEL_OIDC_AUDIENCE`, then exchanges that token through Google STS using `GOOGLE_STS_AUDIENCE`, and finally impersonates `GCP_SERVICE_ACCOUNT_EMAIL`.

Temporary backward compatibility:

- `GCP_AUDIENCE` is still accepted as a legacy fallback.
- If `GCP_AUDIENCE` starts with `https://`, it is used as OIDC audience and converted to STS audience by replacing `https:` with an empty scheme (`//iam.googleapis.com/...`).
- If `GCP_AUDIENCE` starts with `//`, it is used as STS audience and converted to OIDC audience by prefixing `https:`.
- For safety, `GOOGLE_STS_AUDIENCE` is rejected when it starts with `https://` and `VERCEL_OIDC_AUDIENCE` is rejected when it starts with `//`.

## Minimum IAM Roles

Use least privilege:

- On the target service account principal binding:
	- `roles/iam.workloadIdentityUser`
- On project `project-46d21ab8-fbfe-427e-965` for the same service account:
	- `roles/documentai.apiUser`

No Owner or Editor roles are required.
