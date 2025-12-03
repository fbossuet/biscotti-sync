// debug-sync.js - Debug de la synchronisation
import fetch from 'node-fetch';

const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// Test avec le produit "Nos bûches" (ID: 15915279843673)
const TEST_PRODUCT_ID = '15915279843673';

function cleanMetafieldValue(value) {
  if (!value) return '';
  
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].toString();
      }
    } catch (e) {}
  }
  
  if (typeof value === 'string') {
    return value.replace(/^["']|["']$/g, '');
  }
  
  if (value && typeof value === 'object' && 'value' in value) {
    return cleanMetafieldValue(value.value);
  }
  
  return '';
}

async function testShopifyFetch() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 TEST 1: RÉCUPÉRATION DEPUIS SHOPIFY');
  console.log('═══════════════════════════════════════════════════════\n');

  const query = `
    query {
      products(first: 1, query: "id:${TEST_PRODUCT_ID}") {
        edges {
          node {
            id
            title
            handle
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

  const data = await response.json();
  
  if (data.errors) {
    console.error('❌ Erreur GraphQL:', JSON.stringify(data.errors, null, 2));
    return null;
  }

  const product = data.data.products.edges[0]?.node;
  
  if (!product) {
    console.error('❌ Produit non trouvé');
    return null;
  }

  console.log('✅ Produit trouvé:', product.title);
  console.log('\n📋 Metafields bruts:\n');
  
  product.metafields.edges.forEach(({ node }, index) => {
    console.log(`${index + 1}. namespace: "${node.namespace}", key: "${node.key}"`);
    console.log(`   value: ${JSON.stringify(node.value)}\n`);
  });

  // Conversion des metafields
  const metafields = {};
  product.metafields.edges.forEach(({ node }) => {
    const key = node.key.replace(/-/g, '_');
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    metafields[camelKey] = cleanMetafieldValue(node.value);
  });

  console.log('🔄 Metafields après conversion camelCase:\n');
  Object.keys(metafields).forEach(key => {
    console.log(`   ${key}: "${metafields[key]}"`);
  });
  console.log('\n');

  return {
    id: product.id.replace('gid://shopify/Product/', ''),
    title: product.title,
    handle: product.handle,
    metafields: {
      lienversClickAndCollect: metafields.lienversClickAndCollect || ''
    }
  };
}

async function testWebflowFetch() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 STRUCTURE WEBFLOW - NOMS DE CHAMPS EXACTS');
  console.log('═══════════════════════════════════════════════════════\n');

  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erreur Webflow:', error);
    return;
  }

  const data = await response.json();
  
  if (data.items && data.items.length > 0) {
    console.log('✅ Item Webflow récupéré\n');
    console.log('📋 TOUS LES NOMS DE CHAMPS:\n');
    
    Object.keys(data.items[0].fieldData).sort().forEach(fieldName => {
      console.log(`   "${fieldName}"`);
    });
    console.log('\n');
    
    console.log('🔍 RECHERCHE DU CHAMP "ordre":\n');
    Object.keys(data.items[0].fieldData).forEach(fieldName => {
      if (fieldName.includes('ordre') || fieldName.includes('affichage')) {
        console.log(`   ✓ TROUVÉ: "${fieldName}"`);
      }
    });
    console.log('\n');
  }
}

async function testWebflowUpdate(product) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 TEST 3: TENTATIVE DE MISE À JOUR');
  console.log('═══════════════════════════════════════════════════════\n');

  // Trouver l'item Webflow correspondant
  const searchResponse = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
    {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'accept': 'application/json'
      }
    }
  );

  const searchData = await searchResponse.json();
  const existingItem = searchData.items.find(
    item => item.fieldData['shopify-product-id'] === product.id
  );

  if (!existingItem) {
    console.log('⚠️  Produit non trouvé dans Webflow');
    return;
  }

  console.log(`✅ Item trouvé dans Webflow: ${existingItem.id}\n`);

  const webflowData = {
    fieldData: {
      'lien-vers-click-and-collect': product.metafields.lienversClickAndCollect
    }
  };

  console.log('📤 Données à envoyer:\n');
  console.log(JSON.stringify(webflowData, null, 2));
  console.log('\n');

  const updateResponse = await fetch(
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

  if (!updateResponse.ok) {
    const error = await updateResponse.json();
    console.error('❌ Erreur mise à jour:', JSON.stringify(error, null, 2));
    return;
  }

  const result = await updateResponse.json();
  console.log('✅ Mise à jour réussie!\n');
  console.log('📋 Résultat:\n');
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  try {
    await testWebflowFetch();
  } catch (error) {
    console.error('❌ ERREUR:', error.message);
    console.error(error);
  }
}

main();
