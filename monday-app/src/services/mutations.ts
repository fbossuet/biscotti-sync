export const CREATE_RESERVATION = `
  mutation CreateReservation($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
    create_item(
      board_id: $boardId
      item_name: $itemName
      column_values: $columnValues
      create_labels_if_missing: true
    ) {
      id
      name
    }
  }
`;

export const UPDATE_EQUIPMENT_STATUS = `
  mutation UpdateEquipmentStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(
      board_id: $boardId
      item_id: $itemId
      column_id: $columnId
      value: $value
    ) {
      id
    }
  }
`;

export const DELETE_RESERVATION = `
  mutation DeleteReservation($itemId: ID!) {
    delete_item(item_id: $itemId) {
      id
    }
  }
`;
