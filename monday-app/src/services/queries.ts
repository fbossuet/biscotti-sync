export const GET_DEMAND_WITH_SUBITEMS = `
  query GetDemandWithSubitems($itemId: [ID!]!) {
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
          ... on BoardRelationValue {
            linked_item_ids
          }
        }
      }
    }
  }
`;

export const GET_EQUIPMENT_PAGE = `
  query GetEquipmentPage($cursor: String!, $columnIds: [String!]) {
    next_items_page(limit: 500, cursor: $cursor) {
      cursor
      items {
        id
        name
        column_values(ids: $columnIds) {
          id
          text
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
  query GetBoardItems($boardId: ID!, $columnIds: [String!]) {
    boards(ids: [$boardId]) {
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`;

export const GET_RESERVATION_BOARD_ITEMS = `
  query GetReservationBoardItems($boardId: ID!) {
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
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    }
  }
`;

export const GET_RESERVATION_BOARD_PAGE = `
  query GetReservationBoardPage($cursor: String!) {
    next_items_page(limit: 500, cursor: $cursor) {
      cursor
      items {
        id
        name
        column_values {
          id
          text
          value
          ... on BoardRelationValue {
            linked_item_ids
          }
        }
      }
    }
  }
`;
