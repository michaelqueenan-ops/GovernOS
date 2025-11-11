# GovernOS ROI – Azure Static Web App

A demo-ready React (Vite + TypeScript) app to model ROI for CIO/CISO/CFO personas, with shareable scenario links.

## Local run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to Azure Static Web Apps

### Option A – Portal (quick)
1. Create **Static Web App** in Azure Portal.
2. Build Presets: *Custom*  
   - App location: `/`  
   - Output location: `dist`
3. Connect to your GitHub repo. Azure will auto-create a workflow.

### Option B – Manual GitHub Actions
Create a repo secret **AZURE_STATIC_WEB_APPS_API_TOKEN** from the Static Web App resource. Add this workflow to `.github/workflows/azure-static-web-apps.yml`:

```yaml
name: Azure Static Web Apps CI/CD
on:
  push:
    branches: [ main ]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [ main ]

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: \${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: \${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: '/'
          output_location: 'dist'

  close_pull_request_job:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: \${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: close
```

## Notes
- **Share Link** button encodes inputs into `?s=...` so you can send prefilled scenarios.
- All UI is local; no backend required.
