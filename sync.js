// sync.js - Synchronisation Shopify → Webflow CMS
import fetch from 'node-fetch';

// ========================================
// 🔐 CONFIGURATION
// ========================================
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
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
async function syncToWebflow(products) {
  console.log('\n🔄 Synchronisation vers Webflow CMS...\n');

  const stats = {
    created: 0,
    updated: 0,
    errors: 0
  };

  for (const product of products) {
    try {
      // Préparer les données pour Webflow
      const webflowData = {
        fieldData: {
          name: product.title,
          slug: product.handle,
          description: product.body_html || '',
          prix: product.variants[0]?.price?.toString() || '0',
          'shopify-product-id': product.id.toString(),
          'shopify-handle': product.handle,
          
          // Metafields Shopify → Webflow
          'produit-du-moment': 
            product.metafields['custom.produit_du_moment'] === 'true' || 
            product.metafields['custom.produit_du_moment'] === 'Vrai' ||
            product.metafields['custom.produit_du_moment'] === '1',
            
          'encart-vert': product.metafields['custom.encart_vert'] || '',
          
          'date-disponibilite': product.metafields['custom.date_disponibilite'] || ''
        }
      };

      // Ajouter l'image principale si elle existe
      if (product.image?.src) {
        webflowData.fieldData['image-principale'] = {
          url: product.image.src,
          alt: product.image.alt || product.title
        };
      }

      // Vérifier si le produit existe déjà dans Webflow
      const existingItemsResponse = await fetch(
        `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?fieldData[shopify-product-id]=${product.id}`,
        {
          headers: {
            'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
            'accept': 'application/json'
          }
        }
      );

      if (!existingItemsResponse.ok) {
        throw new Error(`Erreur vérification: ${existingItemsResponse.status}`);
      }

      const existingItems = await existingItemsResponse.json();

      if (existingItems.items && existingItems.items.length > 0) {
        // Produit existe → MISE À JOUR
        const itemId = existingItems.items[0].id;
        
        const updateResponse = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`,
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
          console.log(`   ✅ Mis à jour : ${product.title}`);
          stats.updated++;
        } else {
          const error = await updateResponse.json();
          console.error(`   ❌ Erreur MAJ ${product.title}:`, error);
          stats.errors++;
        }

      } else {
        // Produit n'existe pas → CRÉATION
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
          console.error(`   ❌ Erreur création ${product.title}:`, error);
          stats.errors++;
        }
      }

      // Pause pour respecter les limites de l'API Webflow (60 req/min)
      await new Promise(resolve => setTimeout(resolve, 1100));

    } catch (error) {
      console.error(`   ❌ Erreur pour ${product.title}:`, error.message);
      stats.errors++;
    }
  }

  return stats;
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
