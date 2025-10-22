import fetch from 'node-fetch';

// ========================================
// CONFIGURATION
// ========================================
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// Validation
if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN || !WEBFLOW_TOKEN || !WEBFLOW_COLLECTION_ID) {
  console.error('❌ Variables d\'environnement manquantes !');
  process.exit(1);
}

// ========================================
// 1. RÉCUPÉRER LES PRODUITS SHOPIFY
// ========================================
async function getShopifyProducts() {
  console.log('📦 Récupération des produits Shopify...');
  
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ ${data.products.length} produits récupérés`);
  return data.products;
}

// ========================================
// 2. RÉCUPÉRER LES ITEMS WEBFLOW EXISTANTS
// ========================================
async function getWebflowItems() {
  console.log('\n📋 Récupération des items Webflow existants...');
  
  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
    {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Webflow API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ ${data.items?.length || 0} items trouvés dans Webflow\n`);
  return data.items || [];
}

// ========================================
// 3. CRÉER/METTRE À JOUR DANS WEBFLOW
// ========================================
async function syncToWebflow(products) {
  console.log('🔄 Synchronisation vers Webflow CMS...\n');
  
  const existingItems = await getWebflowItems();
  
  let created = 0;
  let updated = 0;
  let errors = 0;
  
  for (const product of products) {
    try {
      // Données basiques du produit
      const firstVariant = product.variants?.[0] || {};
      const firstImage = product.images?.[0];
      
      const webflowData = {
        isArchived: false,
        isDraft: false,
        fieldData: {
          name: product.title || 'Sans titre',
          slug: product.handle || product.title?.toLowerCase().replace(/\s+/g, '-') || 'produit',
          'product-description': product.body_html || '',
          price: parseFloat(firstVariant.price) || 0,
          'product-id': product.id.toString(),
          // Image principale (si elle existe)
          ...(firstImage ? { 'main-image': { url: firstImage.src } } : {})
        }
      };

      // Vérifier si le produit existe déjà
      const existingItem = existingItems.find(
        item => item.fieldData?.['product-id'] === product.id.toString()
      );

      let response;
      
      if (existingItem) {
        // METTRE À JOUR
        response = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${existingItem.id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
              'accept': 'application/json',
              'content-type': 'application/json'
            },
            body: JSON.stringify(webflowData)
          }
        );
        
        if (response.ok) {
          console.log(`🔄 Mis à jour : ${product.title}`);
          updated++;
        }
      } else {
        // CRÉER
        response = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
              'accept': 'application/json',
              'content-type': 'application/json'
            },
            body: JSON.stringify(webflowData)
          }
        );
        
        if (response.ok) {
          console.log(`✅ Créé : ${product.title}`);
          created++;
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Erreur pour ${product.title}:`, errorData);
        errors++;
      }

    } catch (error) {
      console.error(`❌ Erreur pour ${product.title}:`, error.message);
      errors++;
    }
  }

  console.log('\n📊 RÉSUMÉ :');
  console.log(`   ✅ Créés : ${created}`);
  console.log(`   🔄 Mis à jour : ${updated}`);
  console.log(`   ❌ Erreurs : ${errors}`);
}

// ========================================
// 4. EXÉCUTION PRINCIPALE
// ========================================
(async () => {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Démarrage de la synchronisation Shopify → Webflow...\n');
    
    // Récupérer les produits
    const products = await getShopifyProducts();
    
    // Synchroniser vers Webflow
    await syncToWebflow(products);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Synchronisation terminée en ${duration}s`);
    console.log('👉 Allez dans Webflow CMS pour voir vos produits');
    
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
