// sync.js - Synchronisation Shopify → Webflow CMS
import fetch from 'node-fetch';

// ========================================
// 🔐 CONFIGURATION
// ========================================
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// Vérification des variables d'environnement
if (!SHOPIFY_STORE || !SHOPIFY_TOKEN || !WEBFLOW_TOKEN || !WEBFLOW_COLLECTION_ID) {
  console.error('❌ Variables d\'environnement manquantes!');
  console.error('Vérifiez: SHOPIFY_DOMAIN, SHOPIFY_TOKEN, WEBFLOW_TOKEN, WEBFLOW_COLLECTION_ID');
  console.error(`SHOPIFY_STORE: ${SHOPIFY_STORE ? '✅' : '❌'}`);
  console.error(`SHOPIFY_TOKEN: ${SHOPIFY_TOKEN ? '✅' : '❌'}`);
  console.error(`WEBFLOW_TOKEN: ${WEBFLOW_TOKEN ? '✅' : '❌'}`);
  console.error(`WEBFLOW_COLLECTION_ID: ${WEBFLOW_COLLECTION_ID ? '✅' : '❌'}`);
  process.exit(1);
}

// ========================================
// 🧹 NETTOYER LES VALEURS METAFIELDS
// ========================================
function cleanMetafieldValue(value) {
  if (!value) return '';
  
  // Si c'est un string
  if (typeof value === 'string') {
    // Enlever les crochets et guillemets
    let cleaned = value
      .replace(/^\["|"\]$/g, '')  // Enlève [" au début et "] à la fin
      .replace(/^\["/, '')         // Enlève [" au début
      .replace(/"\]$/, '')         // Enlève "] à la fin
      .replace(/^"/, '')           // Enlève " au début
      .replace(/"$/, '')           // Enlève " à la fin
      .trim();
    
    return cleaned;
  }
  
  // Si c'est un array
  if (Array.isArray(value)) {
    return value[0] || '';  // Prendre le premier élément
  }
  
  // Sinon retourner tel quel
  return value.toString();
}

// ========================================
// 🧹 NETTOYER LE HTML (enlever les balises)
// ========================================
function cleanHtml(html) {
  if (!html) return '';
  
  return html
    // Remplacer les <br> et <br/> par des retours à la ligne
    .replace(/<br\s*\/?>/gi, '\n')
    // Remplacer les </p> par double retour à la ligne
    .replace(/<\/p>/gi, '\n\n')
    // Enlever toutes les autres balises HTML
    .replace(/<[^>]*>/g, '')
    // Décoder les entités HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Nettoyer les espaces multiples
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ========================================
// 🛍️ RÉCUPÉRER LES PRODUITS SHOPIFY
// ========================================
async function fetchShopifyProducts() {
  console.log('📦 Récupération des produits depuis Shopify...\n');
  
  const query = `
    {
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            status
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            metafields(first: 20) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN
        },
        body: JSON.stringify({ query })
      }
    );

    if (!response.ok) {
      throw new Error(`Erreur Shopify: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Erreur GraphQL: ${JSON.stringify(data.errors)}`);
    }

    const products = data.data.products.edges.map(edge => {
      const product = edge.node;
      
      // Extraire les metafields dans un objet simple
      const metafields = {};
      product.metafields.edges.forEach(metaEdge => {
        const meta = metaEdge.node;
        const key = `${meta.namespace}.${meta.key}`;
        metafields[key] = meta.value;
      });

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        descriptionHtml: product.descriptionHtml,
        status: product.status,
        price: product.variants.edges[0]?.node.price || '0',
        imageUrl: product.images.edges[0]?.node.url || null,
        images: product.images.edges.map(imgEdge => ({
          url: imgEdge.node.url,
          alt: imgEdge.node.altText || product.title
        })),
        metafields: metafields
      };
    });

    console.log(`   ✅ ${products.length} produits récupérés\n`);
    return products;

  } catch (error) {
    console.error('❌ Erreur lors de la récupération Shopify:', error.message);
    throw error;
  }
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
          
          // Metafields nettoyés
          'produit-du-moment': 
            product.metafields['custom.produit_du_moment'] === 'true' ||
            product.metafields['custom.produit_du_moment'] === 'Vrai' ||
            product.metafields['custom.produit_du_moment'] === true,
          
          'encart-vert': cleanMetafieldValue(product.metafields['custom.encart_vert']),
          'date-disponibilite': cleanMetafieldValue(product.metafields['custom.date_disponibilite'])
        }
      };

      // Image principale
      if (product.imageUrl) {
        webflowData.fieldData['image-principale'] = {
          url: product.imageUrl,
          alt: product.title
        };
      }

      // Images supplémentaires (max 9 pour ne pas dépasser les 10 images Webflow)
      const additionalImages = product.images.slice(1, 10);
      additionalImages.forEach((img, index) => {
        webflowData.fieldData[`image-${index + 2}`] = {
          url: img.url,
          alt: img.alt
        };
      });

      // Vérifier si le produit existe déjà
      const existingItemId = existingByShopifyId[shopifyId] || existingBySlug[product.handle];

      if (existingItemId) {
        // ✅ MISE À JOUR
        const updateResponse = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${existingItemId}`,
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
              'accept': 'application/json',
              'content-type': 'application/json'
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
// 🚀 FONCTION PRINCIPALE
// ========================================
async function main() {
  console.log('\n🚀 DÉBUT DE LA SYNCHRONISATION SHOPIFY → WEBFLOW\n');
  console.log('='.repeat(60));
  console.log('\n');

  try {
    // 1. Récupérer les produits Shopify
    const products = await fetchShopifyProducts();

    // 2. Synchroniser vers Webflow
    const stats = await syncToWebflow(products);

    // 3. Afficher le résumé
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 RÉSUMÉ DE LA SYNCHRONISATION\n');
    console.log(`   ✅ Créés    : ${stats.created}`);
    console.log(`   🔄 Mis à jour : ${stats.updated}`);
    console.log(`   ❌ Erreurs   : ${stats.errors}`);
    console.log(`   📦 Total     : ${products.length} produits traités`);
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Synchronisation terminée avec succès!\n');

  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    process.exit(1);
  }
}

// Lancer le script
main();
