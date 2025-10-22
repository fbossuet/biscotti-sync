// sync.js - Synchronisation Shopify → Webflow CMS
import fetch from 'node-fetch';

// ========================================
// 🔐 CONFIGURATION
// ========================================
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN;  // ✅ CHANGÉ
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;   // ✅ CHANGÉ
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// Vérification des variables d'environnement
if (!SHOPIFY_STORE || !SHOPIFY_TOKEN || !WEBFLOW_TOKEN || !WEBFLOW_COLLECTION_ID) {
  console.error('❌ Variables d\'environnement manquantes!');
  console.error('Vérifiez: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN, WEBFLOW_TOKEN, WEBFLOW_COLLECTION_ID');
  process.exit(1);
}

// ========================================
// 📦 RÉCUPÉRATION DES PRODUITS SHOPIFY
// ========================================
async function fetchShopifyProducts() {
  console.log('📦 Récupération des produits depuis Shopify...\n');

  try {
    // Requête GraphQL pour récupérer les produits avec metafields
    const query = `
      {
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              variants(first: 10) {
                edges {
                  node {
                    price
                    compareAtPrice
                  }
                }
              }
              featuredImage {
                url
                altText
              }
              metafields(first: 20) {
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Shopify ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Erreur GraphQL: ${JSON.stringify(data.errors)}`);
    }
    
    // Transformer les données GraphQL en format simple
    const products = data.data.products.edges.map(({ node }) => {
      // Extraire les metafields
      const metafields = {};
      node.metafields.edges.forEach(({ node: metafield }) => {
        const key = `${metafield.namespace}.${metafield.key}`;
        metafields[key] = metafield.value;
      });

      return {
        id: node.id.split('/').pop(), // Extraire l'ID numérique
        title: node.title,
        handle: node.handle,
        body_html: node.descriptionHtml,
        variants: node.variants.edges.map(({ node: variant }) => ({
          price: variant.price
        })),
        image: node.featuredImage ? {
          src: node.featuredImage.url,
          alt: node.featuredImage.altText
        } : null,
        metafields: metafields
      };
    });

    console.log(`✅ ${products.length} produits récupérés\n`);
    
    // Afficher les produits et leurs metafields pour debug
    products.forEach(product => {
      console.log(`📦 ${product.title}`);
      console.log(`   Handle: ${product.handle}`);
      console.log(`   Prix: ${product.variants[0]?.price || 'N/A'}`);
      console.log(`   Metafields:`, Object.keys(product.metafields).length > 0 ? product.metafields : 'Aucun');
      console.log('');
    });

    return products;

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des produits:', error.message);
    throw error;
  }
}

// ========================================
// 🔄 SYNCHRONISATION VERS WEBFLOW
// ========================================
// ========================================
// 🔄 SYNCHRONISATION VERS WEBFLOW
// ========================================
async function syncToWebflow(products) {
  console.log('🔄 Synchronisation vers Webflow CMS...\n');
  
  const stats = { created: 0, updated: 0, errors: 0 };

  // 1. Récupérer tous les produits existants dans Webflow
  console.log('📋 Récupération des produits existants dans Webflow...');
  const existingProducts = await fetchAllWebflowItems();
  
  // Créer un index par slug pour recherche rapide
  const existingBySlug = {};
  const existingByShopifyId = {};
  
  existingProducts.forEach(item => {
    if (item.fieldData.slug) {
      existingBySlug[item.fieldData.slug] = item.id;
    }
    if (item.fieldData['shopify-product-id']) {
      existingByShopifyId[item.fieldData['shopify-product-id']] = item.id;
    }
  });

  console.log(`   ✅ ${existingProducts.length} produits trouvés dans Webflow\n`);

  // 2. Synchroniser chaque produit
  for (const product of products) {
    try {
      // Extraire l'ID numérique de Shopify
      const shopifyId = product.id.replace('gid://shopify/Product/', '');
      
      // Préparer les données
      const webflowData = {
        fieldData: {
          name: product.title,
          slug: product.handle,
          description: product.descriptionHtml || '',
          prix: product.price?.toString() || '0',
          'shopify-product-id': shopifyId,
          'shopify-handle': product.handle,
          
          // Metafields
          'produit-du-moment': 
            product.metafields['custom.produit_du_moment'] === 'true' ||
            product.metafields['custom.produit_du_moment'] === 'Vrai' ||
            product.metafields['custom.produit_du_moment'] === true,
          'encart-vert': product.metafields['custom.encart_vert'] || '',
          'date-disponibilite': product.metafields['custom.date_disponibilite'] || ''
        }
      };

      // Image principale
      if (product.imageUrl) {
        webflowData.fieldData['image-principale'] = {
          url: product.imageUrl,
          alt: product.imageAlt || product.title
        };
      }

      // 3. Vérifier si le produit existe déjà
      const existingItemId = existingByShopifyId[shopifyId] || existingBySlug[product.handle];

      if (existingItemId) {
        // ✅ MISE À JOUR
        const updateResponse = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${existingItemId}`,
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

        if (updateResponse.ok) {
          console.log(`   🔄 Mis à jour: ${product.title}`);
          stats.updated++;
        } else {
          const errorData = await updateResponse.json();
          console.log(`   ❌ Erreur MAJ ${product.title}:`, errorData);
          stats.errors++;
        }

      } else {
        // ✅ CRÉATION
        const createResponse = await fetch(
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

        if (createResponse.ok) {
          console.log(`   ✅ Créé: ${product.title}`);
          stats.created++;
        } else {
          const errorData = await createResponse.json();
          console.log(`   ❌ Erreur création ${product.title}:`, errorData);
          stats.errors++;
        }
      }

      // Pause pour respecter les limites de l'API Webflow (60 req/min)
      await new Promise(resolve => setTimeout(resolve, 1100));

    } catch (error) {
      console.log(`   ❌ Erreur pour ${product.title}:`, error.message);
      stats.errors++;
    }
  }

  return stats;
}

// ========================================
// 📋 RÉCUPÉRER TOUS LES ITEMS WEBFLOW
// ========================================
async function fetchAllWebflowItems() {
  const allItems = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    try {
      const response = await fetch(
        `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
            'accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        break;
      }

      allItems.push(...data.items);
      
      // Si on a récupéré moins que la limite, c'est la dernière page
      if (data.items.length < limit) {
        break;
      }

      offset += limit;

      // Pause pour respecter les limites de l'API
      await new Promise(resolve => setTimeout(resolve, 1100));

    } catch (error) {
      console.error('Erreur lors de la récupération des items Webflow:', error.message);
      break;
    }
  }

  return allItems;
}


// ========================================
// 🚀 FONCTION PRINCIPALE
// ========================================
async function main() {
  console.log('🚀 Démarrage de la synchronisation Shopify → Webflow\n');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // 1. Récupérer les produits Shopify
    const products = await fetchShopifyProducts();

    if (products.length === 0) {
      console.log('⚠️  Aucun produit à synchroniser');
      return;
    }

    // 2. Synchroniser vers Webflow
    const stats = await syncToWebflow(products);

    // 3. Afficher le résumé
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE LA SYNCHRONISATION\n');
    console.log(`   ✅ Produits créés    : ${stats.created}`);
    console.log(`   🔄 Produits mis à jour : ${stats.updated}`);
    console.log(`   ❌ Erreurs           : ${stats.errors}`);
    console.log('\n═══════════════════════════════════════════════════');

    if (stats.errors > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    process.exit(1);
  }
}

// Exécution
main();
