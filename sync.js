// sync.js - Synchronisation Shopify → Webflow CMS
import fetch from 'node-fetch';

// ========================================
// 🔐 CONFIGURATION
// ========================================
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// ========================================
// ✅ VÉRIFICATION DES VARIABLES D'ENVIRONNEMENT
// ========================================
console.log('🔍 Vérification de la configuration...\n');

const missingVars = [];

if (!SHOPIFY_STORE) missingVars.push('SHOPIFY_DOMAIN');
if (!SHOPIFY_TOKEN) missingVars.push('SHOPIFY_TOKEN');
if (!WEBFLOW_TOKEN) missingVars.push('WEBFLOW_TOKEN');
if (!WEBFLOW_COLLECTION_ID) missingVars.push('WEBFLOW_COLLECTION_ID');

if (missingVars.length > 0) {
  console.error('❌ ERREUR : Variables d\'environnement manquantes !');
  console.error('');
  console.error('Variables manquantes :');
  missingVars.forEach(v => console.error(`   ❌ ${v}`));
  console.error('');
  console.error('👉 Vérifiez vos secrets GitHub :');
  console.error('   Settings → Secrets and variables → Actions');
  console.error('');
  process.exit(1);
}

console.log('✅ Configuration OK');
console.log(`   • Shopify Store: ${SHOPIFY_STORE}`);
console.log(`   • Shopify Token: ${SHOPIFY_TOKEN ? 'Défini (longueur: ' + SHOPIFY_TOKEN.length + ')' : 'MANQUANT'}`);
console.log(`   • Webflow Token: ${WEBFLOW_TOKEN ? 'Défini (longueur: ' + WEBFLOW_TOKEN.length + ')' : 'MANQUANT'}`);
console.log(`   • Collection ID: ${WEBFLOW_COLLECTION_ID}`);
console.log('');

// ========================================
// 🧹 NETTOYER LES METAFIELDS (VERSION CORRIGÉE)
// ========================================
function cleanMetafieldValue(value) {
  if (!value) return '';
  
  // Si c'est une chaîne qui ressemble à un tableau JSON
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      // Si c'est un tableau, prendre le premier élément
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].toString();
      }
    } catch (e) {
      // Si le parsing échoue, continuer avec le traitement normal
    }
  }
  
  // Si c'est déjà une chaîne simple, retourner directement
  if (typeof value === 'string') {
    return value.replace(/^["']|["']$/g, ''); // Enlever les guillemets de début/fin
  }
  
  // Si c'est un objet avec une propriété 'value'
  if (value && typeof value === 'object' && 'value' in value) {
    return cleanMetafieldValue(value.value); // Appel récursif
  }
  
  return '';
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
// 🛒 RÉCUPÉRER LES PRODUITS SHOPIFY
// ========================================
async function fetchShopifyProducts() {
  console.log('🛒 Récupération des produits depuis Shopify...\n');

  const query = `
    {
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            vendor
            tags
            featuredImage {
              url
            }
            variants(first: 1) {
              edges {
                node {
                  price
                  compareAtPrice
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
    const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const products = data.data.products.edges.map(edge => {
      const product = edge.node;
      const variant = product.variants.edges[0]?.node;
      
      // Extraire les metafields
      const metafields = {};
      product.metafields.edges.forEach(({ node }) => {
        const key = `${node.namespace}.${node.key}`;
        metafields[key] = node.value;
      });

      return {
        shopifyId: product.id.split('/').pop(),
        title: product.title,
        slug: product.handle,
        description: cleanHtml(product.descriptionHtml),
        image: product.featuredImage?.url || '',
        price: parseFloat(variant?.price || 0),
        compareAtPrice: variant?.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
        vendor: product.vendor,
        tags: product.tags,
        
        // Metafields spécifiques
        ingredients: cleanMetafieldValue(metafields['custom.ingredients']),
        allergenes: cleanMetafieldValue(metafields['custom.allergenes']),
        conseils: cleanMetafieldValue(metafields['custom.conseils_de_conservation']),
        poids: cleanMetafieldValue(metafields['custom.poids']),
        valeurs: cleanMetafieldValue(metafields['custom.valeurs_nutritionnelles']),
        origine: cleanMetafieldValue(metafields['custom.origine']),
        encartVert: cleanMetafieldValue(metafields['custom.encart_vert'])
      };
    });

    console.log(`   ✅ ${products.length} produits récupérés\n`);
    return products;

  } catch (error) {
    throw new Error(`Erreur lors de la récupération des produits Shopify: ${error.message}`);
  }
}

// ========================================
// 📦 RÉCUPÉRER LES ITEMS WEBFLOW EXISTANTS
// ========================================
async function fetchWebflowItems() {
  console.log('✅ Récupération des produits existants dans Webflow...\n');

  try {
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
      const errorText = await response.text();
      throw new Error(`Webflow API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const items = data.items || [];

    console.log(`   ✅ ${items.length} produits trouvés dans Webflow\n`);

    // Créer un Map pour recherche rapide par slug ET par shopify-product-id
    const itemsMap = new Map();
    items.forEach(item => {
      if (item.fieldData.slug) {
        itemsMap.set(item.fieldData.slug, item);
      }
      if (item.fieldData['shopify-product-id']) {
        itemsMap.set(`shopify-${item.fieldData['shopify-product-id']}`, item);
      }
    });

    return itemsMap;

  } catch (error) {
    throw new Error(`Erreur lors de la récupération des items Webflow: ${error.message}`);
  }
}

// ========================================
// 🔄 SYNCHRONISER VERS WEBFLOW
// ========================================
async function syncToWebflow(products) {
  console.log('🔄 Synchronisation vers Webflow CMS...\n');

  const stats = { created: 0, updated: 0, errors: 0 };

  // Récupérer les items existants
  const existingItems = await fetchWebflowItems();

  for (const product of products) {
    try {
      // Chercher l'item existant par slug OU par shopify-product-id
      let existingItem = existingItems.get(product.slug);
      if (!existingItem) {
        existingItem = existingItems.get(`shopify-${product.shopifyId}`);
      }

      const webflowData = {
        fieldData: {
          'name': product.title,
          'slug': product.slug,
          'shopify-product-id': product.shopifyId,
          'description': product.description,
          'price': product.price,
          'ingredients': product.ingredients,
          'allergenes': product.allergenes,
          'conseils-de-conservation': product.conseils,
          'poids': product.poids,
          'valeurs-nutritionnelles': product.valeurs,
          'origine': product.origine,
          'encart-vert': product.encartVert
        }
      };

      // Ajouter l'image si elle existe
      if (product.image) {
        webflowData.fieldData['main-image'] = {
          url: product.image,
          alt: product.title
        };
      }

      if (existingItem) {
        // MISE À JOUR
        console.log(`   🔄 Mise à jour: ${product.title}`);

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

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`      ❌ Erreur update: ${response.status} - ${errorText}`);
          stats.errors++;
        } else {
          stats.updated++;
        }

      } else {
        // CRÉATION
        console.log(`   ✅ Création: ${product.title}`);

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

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`      ❌ Erreur création: ${response.status} - ${errorText}`);
          stats.errors++;
        } else {
          stats.created++;
        }
      }

      // Petit délai pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));

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
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔄 SYNCHRONISATION SHOPIFY → WEBFLOW');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 1. Récupérer les produits Shopify
    const products = await fetchShopifyProducts();

    if (products.length === 0) {
      console.log('⚠️  Aucun produit trouvé dans Shopify\n');
      return;
    }

    // 2. Synchroniser vers Webflow
    const stats = await syncToWebflow(products);

    // 3. Afficher le résumé
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE LA SYNCHRONISATION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Créés:      ${stats.created}`);
    console.log(`🔄 Mis à jour: ${stats.updated}`);
    console.log(`❌ Erreurs:    ${stats.errors}`);
    console.log(`📦 Total:      ${products.length}`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERREUR CRITIQUE:', error.message);
    process.exit(1);
  }
}

// Lancer la synchronisation
main();
