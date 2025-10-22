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
  console.log('\n🔄 Synchronisation vers Webflow CMS...\n');

  const stats = {
    created: 0,
    updated: 0,
    errors: 0
  };

  for (const product of products) {
    try {
      // Préparer les données pour Webflow avec VOS champs
      const webflowData = {
        fieldData: {
          name: product.title,
          slug: product.handle,
          description: product.body_html || product.description || '',
          prix: parseFloat(product.variants[0]?.price || 0),
          'shopify-product-id': product.id.toString(),
          'shopify-handle': product.handle,
          'produit-du-moment': false, // Par défaut
          'date-disponibilite': '', // Vide par défaut
          'encart-vert': '' // Vide par défaut
        }
      };

      // Ajouter l'image principale si elle existe
      if (product.image?.src) {
        webflowData.fieldData['image-principale'] = {
          url: product.image.src,
          alt: product.image.alt || product.title
        };
      }

      // Vérifier si le produit existe déjà
      const existingResponse = await fetch(
        `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
        {
          headers: {
            'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
            'accept': 'application/json'
          }
        }
      );

      const existingData = await existingResponse.json();
      const existingProduct = existingData.items?.find(
        item => item.fieldData['shopify-product-id'] === product.id.toString()
      );

      if (existingProduct) {
        // Mise à jour du produit existant
        const updateResponse = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${existingProduct.id}`,
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

        if (updateResponse.ok) {
          console.log(`   🔄 Mis à jour : ${product.title}`);
          stats.updated++;
        } else {
          const error = await updateResponse.json();
          console.error(`   ❌ Erreur pour ${product.title}:`, error);
          stats.errors++;
        }
      } else {
        // Création d'un nouveau produit
        const createResponse = await fetch(
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

        if (createResponse.ok) {
          console.log(`   ✅ Créé : ${product.title}`);
          stats.created++;
        } else {
          const error = await createResponse.json();
          console.error(`   ❌ Erreur pour ${product.title}:`, error);
          stats.errors++;
        }
      }

      // Pause pour respecter les limites de l'API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Erreur pour ${product.title}:`, error.message);
      stats.errors++;
    }
  }

  return stats;
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
