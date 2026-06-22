export const GET_SUBITEM_CONTEXT = `
  query GetSubitemContext($itemId: [ID!]!) {
    items(ids: $itemId) {
      id
      name
      column_values {
        id
        text
        value
      }
      parent_item {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
`;

export const GET_EQUIPMENT_BY_FAMILY = `
  query GetEquipmentByFamily($boardId: ID!, $columnId: String!, $familyItemId: String!) {
    items_page_by_column_values(
      board_id: $boardId
      limit: 500
      columns: [{ column_id: $columnId, column_values: [$familyItemId] }]
    ) {
      cursor
      items {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
`;

export const GET_EQUIPMENT_PAGE = `
  query GetEquipmentPage($boardId: ID!, $cursor: String!) {
    next_items_page(board_id: $boardId, limit: 500, cursor: $cursor) {
      cursor
      items {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
`;

export const GET_RESERVATIONS_FOR_EQUIPMENT = `
  query GetReservationsForEquipment($boardId: ID!, $columnId: String!, $equipmentId: String!) {
    items_page_by_column_values(
      board_id: $boardId
      limit: 500
      columns: [{ column_id: $columnId, column_values: [$equipmentId] }]
    ) {
      cursor
      items {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
`;

export const GET_FAMILIES_BY_SOUS_FAMILLE = `
  query GetFamiliesBySousFamille($boardId: ID!, $columnId: String!, $sousFamille: String!) {
    items_page_by_column_values(
      board_id: $boardId
      limit: 500
      columns: [{ column_id: $columnId, column_values: [$sousFamille] }]
    ) {
      cursor
      items {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
`;

export const GET_CATALOGUE_ITEM_WITH_SUBITEMS = `
  query GetCatalogueItemWithSubitems($itemId: [ID!]!) {
    items(ids: $itemId) {
      id
      name
      column_values {
        id
        text
        value
      }
      subitems {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
`;

export const GET_BOARD_ITEMS = `
  query GetBoardItems($boardId: ID!) {
    boards(ids: [$boardId]) {
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
          }
        }
      }
    }
  }
`;
