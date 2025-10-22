// ========================================
// CONFIGURATION DEPUIS LES SECRETS GITHUB
// ========================================
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// ========================================
// 1. RÉCUPÉRER LES PRODUITS DE SHOPIFY
// ========================================
async function getShopifyProducts() {
  console.log('📦 Récupération des produits Shopify...');
  
  const query = `
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            description
            handle
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 1) {
              edges {
                node {
                  url
                }
              }
            }
            metafields(identifiers: [
              {namespace: "custom", key: "produit_du_moment"},
              {namespace: "custom", key: "bio"},
              {namespace: "custom", key: "vegan"},
              {namespace: "custom", key: "sans_gluten"},
              {namespace: "custom", key: "artisanal"},
              {namespace: "custom", key: "date_disponibilite"}
            ]) {
              key
              value
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  
  if (!data.data || !data.data.products) {
    throw new Error('❌ Erreur lors de la récupération des produits Shopify');
  }
  
  const products = data.data.products.edges.map(edge => edge.node);
  console.log(`✅ ${products.length} produits récupérés`);
  
  return products;
}

// ========================================
// 2. RÉCUPÉRER LES ITEMS EXISTANTS WEBFLOW
// ========================================
async function getWebflowItems() {
  console.log('📋 Récupération des items Webflow existants...');
  
  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?limit=100`,
    {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'accept': 'application/json'
      }
    }
  );

  const data = await response.json();
  console.log(`✅ ${data.items?.length || 0} items trouvés dans Webflow`);
  
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
      // Extraire les metafields
      const getMetafield = (key) => 
        product.metafields?.find(m => m.key === key)?.value || null;

      // Trouver si l'item existe déjà
      const existingItem = existingItems.find(
        item => item.fieldData['shopify-handle'] === product.handle
      );

      // Préparer les données pour Webflow
      const webflowData = {
        fieldData: {
          name: product.title,
          slug: product.handle,
          description: product.description || '',
          prix: `${parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2)}€`,
          'shopify-handle': product.handle,
          'shopify-product-id': product.id,
          'produit-du-moment': getMetafield('produit_du_moment') === 'true',
          bio: getMetafield('bio') === 'true',
          vegan: getMetafield('vegan') === 'true',
          'sans-gluten': getMetafield('sans_gluten') === 'true',
          artisanal: getMetafield('artisanal') === 'true',
          'date-disponibilite': getMetafield('date_disponibilite') || ''
        }
      };

      // Ajouter l'image si disponible
      if (product.images.edges[0]?.node.url) {
        webflowData.fieldData['image-principale'] = {
          url: product.images.edges[0].node.url
        };
      }

      if (existingItem) {
        // METTRE À JOUR
        const response = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${existingItem.id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
              'Content-Type': 'application/json',
              'accept': 'application/json'
            },
            body: JSON.stringify(webflowData)
          }
        );
        
        if (response.ok) {
          console.log(`✅ Mis à jour : ${product.title}`);
          updated++;
        } else {
          const error = await response.text();
          console.error(`❌ Erreur mise à jour ${product.title}:`, error);
          errors++;
        }
      } else {
        // CRÉER
        const response = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
              'Content-Type': 'application/json',
              'accept': 'application/json'
            },
            body: JSON.stringify(webflowData)
          }
        );
        
        if (response.ok) {
          console.log(`✅ Créé : ${product.title}`);
          created++;
        } else {
          const error = await response.text();
          console.error(`❌ Erreur création ${product.title}:`, error);
          errors++;
        }
      }

      // Pause pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
async function sync() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  🚀 Synchronisation Shopify → Webflow         ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  const startTime = Date.now();
  
  try {
    // Vérifier les variables d'environnement
    if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN || !WEBFLOW_TOKEN || !WEBFLOW_COLLECTION_ID) {
      throw new Error('❌ Variables d\'environnement manquantes !');
    }
    
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
}

// Lancer la synchronisation
sync();
