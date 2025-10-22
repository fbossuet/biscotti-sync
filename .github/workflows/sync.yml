name: Sync Shopify to Webflow

on:
  # Exécution automatique toutes les heures
  schedule:
    - cron: '0 * * * *'
  
  # Permet de lancer manuellement depuis GitHub
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run sync script
        run: node sync.js
        env:
          SHOPIFY_DOMAIN: ${{ secrets.SHOPIFY_DOMAIN }}
          SHOPIFY_TOKEN: ${{ secrets.SHOPIFY_TOKEN }}
          WEBFLOW_TOKEN: ${{ secrets.WEBFLOW_TOKEN }}
          WEBFLOW_COLLECTION_ID: ${{ secrets.WEBFLOW_COLLECTION_ID }}
