import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================================================
   TYPES
========================================================= */

interface Warehouse {
  id: number;
  warehouse_code?: string;
  code?: string;
  name: string;
  warehouse_type?: string;
  type?: string;
  is_active?: boolean;
}

interface InventoryItem {
  id?: number;

  warehouse_id?: number;
  warehouse_code?: string;
  warehouse_name?: string;

  warehouse?: {
    id?: number;
    warehouse_code?: string;
    code?: string;
    name?: string;
    warehouse_name?: string;
    warehouse_type?: string;
  };

  medicine_id?: number;
  medicine_code?: string;
  medicine_name?: string;

  medicine?: {
    id?: number;
    medicine_code?: string;
    code?: string;
    name?: string;
    medicine_name?: string;
    active_ingredient?: string | null;
    strength?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  };

  batch_id?: number;
  lot_number?: string;
  expiry_date?: string | null;

  batch?: {
    id?: number;
    lot_number?: string;
    expiry_date?: string | null;
  };

  quantity?: number | string;
  stock_quantity?: number | string;

  physical_quantity?: number | string;
  reserved_quantity?: number | string;
  available_quantity?: number | string;
  is_expired?: boolean;
  is_over_reserved?: boolean;

  unit?: string | null;
}

interface UserInfo {
  id?: number;
  full_name?: string;
  email?: string;
}

interface TransferItem {
  id: number;
  batch_id?: number;
  lot_number?: string;
  expiry_date?: string | null;
  quantity: number | string;
  source_available_quantity?: number | string;
  created_at?: string | null;
  updated_at?: string | null;

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    active_ingredient?: string | null;
    strength?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  };
}

interface WarehouseTransfer {
  id: number;
  transfer_code?: string | null;

  source_warehouse_id?: number;
  destination_warehouse_id?: number;

  source_warehouse?: {
    id?: number;
    warehouse_code?: string;
    name?: string;
    warehouse_type?: string;
  };

  destination_warehouse?: {
    id?: number;
    warehouse_code?: string;
    name?: string;
    warehouse_type?: string;
  };

  transfer_date?: string | null;
  status?: string | null;
  note?: string | null;

  item_count?: number | string;
  total_quantity?: number | string;

  created_by?: UserInfo | null;
  submitted_at?: string | null;

  approved_by?: UserInfo | null;
  approved_at?: string | null;

  returned_by?: UserInfo | null;
  returned_at?: string | null;
  return_reason?: string | null;

  created_at?: string | null;
  updated_at?: string | null;

  items?: TransferItem[];
}

interface HeaderFormValues {
  source_warehouse_id: number;
  destination_warehouse_id: number;
  note?: string;
}

interface ItemFormValues {
  batch_id: number;
  quantity: number;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const value = data as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key] as T[];
    }
  }

  return [];
}

function normalizeWarehouses(data: unknown): Warehouse[] {
  return normalizeArray<Warehouse>(data, ["data", "warehouses"]);
}

function normalizeInventory(data: unknown): InventoryItem[] {
  return normalizeArray<InventoryItem>(data, ["data", "inventory"]);
}

function normalizeTransfers(data: unknown): WarehouseTransfer[] {
  return normalizeArray<WarehouseTransfer>(data, [
    "data",
    "transfers",
    "warehouse_transfers",
  ]);
}

function isEditableStatus(status?: string | null) {
  return status === "DRAFT" || status === "RETURNED";
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "DRAFT":
      return "Mới";
    case "PENDING":
      return "Chờ duyệt";
    case "RETURNED":
      return "Cần chỉnh sửa";
    case "APPROVED":
      return "Đã duyệt";
    case "REJECTED":
      return "Từ chối";
    case "COMPLETED":
      return "Đã hoàn tất (cũ)";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status || "-";
  }
}

function getStatusColor(status?: string | null) {
  switch (status) {
    case "DRAFT":
      return "default";
    case "PENDING":
      return "orange";
    case "RETURNED":
      return "volcano";
    case "APPROVED":
      return "green";
    case "REJECTED":
      return "red";
    case "COMPLETED":
      return "blue";
    case "CANCELLED":
      return "red";
    default:
      return "default";
  }
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = dayjs(value);

  return date.isValid() ? date.format("DD/MM/YYYY HH:mm") : value;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = dayjs(value);

  return date.isValid() ? date.format("DD/MM/YYYY") : value;
}

function getUserLabel(user?: UserInfo | null) {
  if (!user) {
    return "-";
  }

  return user.full_name || user.email || (user.id ? `#${user.id}` : "-");
}

/* =========================================================
   COMPONENT
========================================================= */

function WarehouseTransfers() {
  const [permissions, setPermissions] =
    useState<string[]>([]);

  const [permissionReady, setPermissionReady] =
    useState(false);

  const canView =
    permissions.includes("TRANSFER_VIEW");

  const canCreate =
    permissions.includes("TRANSFER_CREATE");


  const [headerForm] = Form.useForm<HeaderFormValues>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const watchedSourceWarehouseId = Form.useWatch(
    "source_warehouse_id",
    headerForm,
  );

  const watchedBatchId = Form.useWatch("batch_id", itemForm);
  const watchedQuantity = Form.useWatch("quantity", itemForm);

  /* =========================
     MASTER DATA
  ========================= */

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);

  /* =========================
     CURRENT TRANSFER
  ========================= */

  const [currentTransfer, setCurrentTransfer] =
    useState<WarehouseTransfer | null>(null);

  const [items, setItems] = useState<TransferItem[]>([]);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const [savingHeader, setSavingHeader] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* =========================
     HISTORY
  ========================= */

  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);

  const [transferBatchIds, setTransferBatchIds] = useState<
    Record<number, number[]>
  >({});

  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<string | undefined>();

  /* =========================
     DETAIL DRAWER
  ========================= */

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTransfer, setDetailTransfer] =
    useState<WarehouseTransfer | null>(null);

  /* =========================================================
     INVENTORY HELPERS
  ========================================================= */

  const getInventoryWarehouseId = (item: InventoryItem) =>
    item.warehouse?.id ?? item.warehouse_id;

  const getBatchId = (item: InventoryItem) =>
    item.batch?.id ?? item.batch_id;

  const getMedicineCode = (item: InventoryItem) =>
    item.medicine?.medicine_code ||
    item.medicine?.code ||
    item.medicine_code ||
    "-";

  const getMedicineName = (item: InventoryItem) =>
    item.medicine?.name ||
    item.medicine?.medicine_name ||
    item.medicine_name ||
    "-";

  const getUnit = (item: InventoryItem) =>
    item.medicine?.unit || item.unit || "";

  const getLotNumber = (item: InventoryItem) =>
    item.batch?.lot_number || item.lot_number || "-";

  const getExpiryDate = (item: InventoryItem) =>
    item.batch?.expiry_date || item.expiry_date || null;

  const getPhysicalQuantity = (item: InventoryItem) =>
    Number(
      item.physical_quantity ??
        item.quantity ??
        item.stock_quantity ??
        0,
    );

  const getReservedQuantity = (item: InventoryItem) =>
    Number(item.reserved_quantity ?? 0);

  const getAvailableQuantity = (item: InventoryItem) =>
    Number(
      item.available_quantity ??
        item.quantity ??
        item.stock_quantity ??
        0,
    );

  /* =========================================================
     LOAD DATA
  ========================================================= */

  const loadMasterData = async () => {
    try {
      setMasterLoading(true);

      const [warehouseResponse, inventoryResponse] = await Promise.all([
        api.get("/warehouses", {
          params: {
            is_active: true,
          },
        }),
        api.get("/inventory/availability"),
      ]);

      setWarehouses(normalizeWarehouses(warehouseResponse.data));
      setInventory(normalizeInventory(inventoryResponse.data));
    } catch (error) {
      console.error("Load transfer master data:", error);
      message.error("Không thể tải kho và tồn kho");
    } finally {
      setMasterLoading(false);
    }
  };

  const loadBatchIdsForTransfers = async (
    transferList: WarehouseTransfer[],
  ) => {
    if (transferList.length === 0) {
      setTransferBatchIds({});
      return;
    }

    const results = await Promise.all(
      transferList.map(async (transfer) => {
        try {
          const response = await api.get(
            `/warehouse-transfers/${transfer.id}`,
          );

          const data = response.data;

          const detailItems = Array.isArray(data?.items)
            ? (data.items as TransferItem[])
            : [];

          const batchIds = Array.from(
            new Set(
              detailItems
                .map((item) => item.batch_id)
                .filter(
                  (batchId): batchId is number =>
                    typeof batchId === "number" &&
                    batchId > 0,
                ),
            ),
          );

          return [transfer.id, batchIds] as const;
        } catch (error) {
          console.error(
            `Load batch IDs for transfer ${transfer.id}:`,
            error,
          );

          return [transfer.id, [] as number[]] as const;
        }
      }),
    );

    setTransferBatchIds(
      Object.fromEntries(results) as Record<
        number,
        number[]
      >,
    );
  };

  const loadHistory = async (
    params: {
      status?: string;
      search?: string;
    } = {
      status: historyStatus,
      search: historySearch,
    },
  ) => {
    try {
      setHistoryLoading(true);

      const response = await api.get("/warehouse-transfers", {
        params: {
          status: params.status || undefined,
          search: params.search?.trim() || undefined,
        },
      });

      const loadedTransfers =
        normalizeTransfers(response.data);

      setTransfers(loadedTransfers);

      await loadBatchIdsForTransfers(
        loadedTransfers,
      );
    } catch (error) {
      console.error("Load warehouse transfers:", error);
      message.error("Không thể tải danh sách phiếu chuyển kho");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadTransferDetail = async (
    transferId: number,
    options: {
      setAsCurrent?: boolean;
      openDrawer?: boolean;
    } = {},
  ) => {
    const { setAsCurrent = false, openDrawer = false } = options;

    try {
      if (openDrawer) {
        setDrawerOpen(true);
        setDetailLoading(true);
      }

      const response = await api.get(`/warehouse-transfers/${transferId}`);
      const data = response.data;

      if (data?.success !== true) {
        message.error(data?.message || "Không thể tải chi tiết phiếu");
        return null;
      }

      const transfer = (data.warehouse_transfer ||
        data.transfer ||
        data.data) as WarehouseTransfer | undefined;

      if (!transfer) {
        message.error("Không tìm thấy phiếu chuyển kho");
        return null;
      }

      const detailItems = Array.isArray(data.items)
        ? (data.items as TransferItem[])
        : Array.isArray(transfer.items)
          ? transfer.items
          : [];

      const completeTransfer: WarehouseTransfer = {
        ...transfer,
        items: detailItems,
        item_count: data.item_count ?? detailItems.length,
        total_quantity:
          data.total_quantity ??
          detailItems.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0,
          ),
      };

      if (setAsCurrent) {
        setCurrentTransfer(completeTransfer);
        setItems(detailItems);
        setEditingItemId(null);
        itemForm.resetFields();

        headerForm.setFieldsValue({
          source_warehouse_id: completeTransfer.source_warehouse?.id,
          destination_warehouse_id:
            completeTransfer.destination_warehouse?.id,
          note: completeTransfer.note || undefined,
        });
      }

      if (openDrawer) {
        setDetailTransfer(completeTransfer);
      }

      return completeTransfer;
    } catch (error) {
      console.error("Load transfer detail:", error);
      message.error("Không thể tải chi tiết phiếu chuyển kho");
      return null;
    } finally {
      if (openDrawer) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const meResponse =
          await api.get("/users/me");

        if (cancelled) {
          return;
        }

        const codes =
          Array.isArray(
            meResponse.data?.permissions,
          )
            ? (
                meResponse.data
                  .permissions as unknown[]
              ).filter(
                (
                  value,
                ): value is string =>
                  typeof value === "string",
              )
            : [];

        setPermissions(codes);
        setPermissionReady(true);

        if (
          !codes.includes(
            "TRANSFER_VIEW",
          )
        ) {
          return;
        }

        const [
          warehouseResponse,
          inventoryResponse,
          transferResponse,
        ] = await Promise.all([
          api.get("/warehouses", {
            params: {
              is_active: true,
            },
          }),
          api.get(
            "/inventory/availability",
          ),
          api.get(
            "/warehouse-transfers",
          ),
        ]);

        if (cancelled) {
          return;
        }

        setWarehouses(
          normalizeWarehouses(
            warehouseResponse.data,
          ),
        );

        setInventory(
          normalizeInventory(
            inventoryResponse.data,
          ),
        );

        const loadedTransfers =
          normalizeTransfers(
            transferResponse.data,
          );

        setTransfers(
          loadedTransfers,
        );

        void loadBatchIdsForTransfers(
          loadedTransfers,
        );
      } catch (error) {
        console.error(
          "Initial warehouse transfer load:",
          error,
        );

        if (!cancelled) {
          message.error(
            "Không thể tải dữ liệu chuyển kho",
          );
        }
      } finally {
        if (!cancelled) {
          setPermissionReady(true);
          setMasterLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     DERIVED DATA
  ========================================================= */

  const destinationWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) => warehouse.id !== watchedSourceWarehouseId,
      ),
    [warehouses, watchedSourceWarehouseId],
  );

  const sourceInventory = useMemo(() => {
    if (!watchedSourceWarehouseId) {
      return [];
    }

    return inventory.filter((item) => {
      if (getInventoryWarehouseId(item) !== watchedSourceWarehouseId) {
        return false;
      }

      if (item.is_expired === true || item.is_over_reserved === true) {
        return false;
      }

      const batchId = getBatchId(item);
      const editingItem =
        editingItemId !== null
          ? items.find((row) => row.id === editingItemId)
          : undefined;

      const isEditingCurrentBatch =
        Boolean(batchId) &&
        editingItem?.batch_id === batchId;

      return (
        getAvailableQuantity(item) > 0 ||
        isEditingCurrentBatch
      );
    });
  }, [
    inventory,
    watchedSourceWarehouseId,
    editingItemId,
    items,
  ]);

  const existingBatchIds = useMemo(
    () =>
      new Set(
        items
          .map((item) => item.batch_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    [items],
  );

  const availableBatchOptions = useMemo(() => {
    return sourceInventory.filter((inventoryItem) => {
      const batchId = getBatchId(inventoryItem);

      if (!batchId) {
        return false;
      }

      if (editingItemId !== null) {
        const editingItem = items.find((item) => item.id === editingItemId);

        if (editingItem?.batch_id === batchId) {
          return true;
        }
      }

      return !existingBatchIds.has(batchId);
    });
  }, [sourceInventory, editingItemId, items, existingBatchIds]);

  const selectedInventory = useMemo(() => {
    if (!watchedSourceWarehouseId || !watchedBatchId) {
      return undefined;
    }

    return inventory.find(
      (item) =>
        getInventoryWarehouseId(item) === watchedSourceWarehouseId &&
        getBatchId(item) === watchedBatchId,
    );
  }, [inventory, watchedSourceWarehouseId, watchedBatchId]);

  const selectedEditingItem = useMemo(
    () =>
      editingItemId !== null
        ? items.find((item) => item.id === editingItemId)
        : undefined,
    [editingItemId, items],
  );

  const maxTransferQuantity = useMemo(() => {
    if (!selectedInventory) {
      return 0;
    }

    const available = getAvailableQuantity(selectedInventory);

    if (
      selectedEditingItem &&
      selectedEditingItem.batch_id === getBatchId(selectedInventory)
    ) {
      return available + Number(selectedEditingItem.quantity || 0);
    }

    return available;
  }, [selectedInventory, selectedEditingItem]);

  const quantityValidationMessage = useMemo(() => {
    if (
      watchedQuantity === undefined ||
      watchedQuantity === null
    ) {
      return null;
    }

    const quantity = Number(watchedQuantity);

    if (!Number.isFinite(quantity)) {
      return "Số lượng không hợp lệ";
    }

    if (quantity <= 0) {
      return "Số lượng phải lớn hơn 0";
    }

    if (!Number.isInteger(quantity)) {
      return "Số lượng phải là số nguyên, không được nhập số thập phân";
    }

    if (selectedInventory) {
      if (quantity > maxTransferQuantity) {
        return `Số lượng vượt tồn khả dụng. Tối đa ${maxTransferQuantity} ${getUnit(
          selectedInventory,
        )}`;
      }
    }

    return null;
  }, [
    watchedQuantity,
    selectedInventory,
    maxTransferQuantity,
  ]);

  const currentEditable = canCreate && isEditableStatus(currentTransfer?.status);

  const totalCurrentQuantity = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      ),
    [items],
  );

  /* =========================================================
     HEADER ACTIONS
  ========================================================= */

  const handleCreateOrUpdateHeader = async (values: HeaderFormValues) => {
    if (
      values.source_warehouse_id === values.destination_warehouse_id
    ) {
      message.warning("Kho nguồn và kho đích không được giống nhau");
      return;
    }

    try {
      setSavingHeader(true);

      if (!currentTransfer) {
        const response = await api.post("/warehouse-transfers", {
          source_warehouse_id: values.source_warehouse_id,
          destination_warehouse_id: values.destination_warehouse_id,
          note: values.note?.trim() || null,
        });

        if (response.data?.success !== true) {
          message.error(
            response.data?.message || "Không thể tạo phiếu chuyển kho",
          );
          return;
        }

        const transferId = Number(response.data.transfer_id);

        if (!transferId) {
          message.error("Backend không trả về mã phiếu vừa tạo");
          return;
        }

        await loadTransferDetail(transferId, {
          setAsCurrent: true,
        });

        await loadHistory();

        message.success(
          "Đã tạo phiếu nháp. Bạn có thể thêm nhiều thuốc/lô.",
        );

        return;
      }

      if (!currentEditable) {
        message.warning("Phiếu hiện tại không còn được phép chỉnh sửa");
        return;
      }

      const response = await api.put(
        `/warehouse-transfers/${currentTransfer.id}`,
        {
          source_warehouse_id: values.source_warehouse_id,
          destination_warehouse_id: values.destination_warehouse_id,
          note: values.note?.trim() || null,
        },
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message || "Không thể cập nhật phiếu",
        );
        return;
      }

      await loadTransferDetail(currentTransfer.id, {
        setAsCurrent: true,
      });

      await loadHistory();
      await loadMasterData();

      message.success("Đã cập nhật thông tin phiếu");
    } catch (error) {
      console.error("Save transfer header:", error);
      message.error("Có lỗi khi lưu thông tin phiếu");
    } finally {
      setSavingHeader(false);
    }
  };

  const handleNewTransfer = () => {
    setCurrentTransfer(null);
    setItems([]);
    setEditingItemId(null);
    headerForm.resetFields();
    itemForm.resetFields();
  };

  const handleOpenTransfer = async (transferId: number) => {
    await loadTransferDetail(transferId, {
      setAsCurrent: true,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /* =========================================================
     ITEM ACTIONS
  ========================================================= */

  const handleSourceChange = (value: number) => {
    const destination = headerForm.getFieldValue(
      "destination_warehouse_id",
    );

    if (destination === value) {
      headerForm.setFieldValue("destination_warehouse_id", undefined);
    }

    itemForm.resetFields();
    setEditingItemId(null);
  };

  const handleStartEditItem = (item: TransferItem) => {
    if (!currentEditable) {
      return;
    }

    setEditingItemId(item.id);

    itemForm.setFieldsValue({
      batch_id: item.batch_id,
      quantity: Number(item.quantity),
    });
  };

  const handleCancelEditItem = () => {
    setEditingItemId(null);
    itemForm.resetFields();
  };

  const handleSaveItem = async (values: ItemFormValues) => {
    if (!currentTransfer) {
      message.warning("Hãy tạo phiếu chuyển kho trước");
      return;
    }

    if (!currentEditable) {
      message.warning("Phiếu hiện tại không được phép chỉnh sửa");
      return;
    }

    const quantity = Number(values.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      message.warning("Số lượng phải lớn hơn 0");
      return;
    }

    if (!Number.isInteger(quantity)) {
      message.warning("Số lượng phải là số nguyên, không được nhập số thập phân");
      return;
    }

    if (selectedInventory) {
      if (quantity > maxTransferQuantity) {
        message.warning(
          `Số lượng vượt tồn khả dụng. Tối đa ${maxTransferQuantity} ${getUnit(
            selectedInventory,
          )}`,
        );
        return;
      }
    }

    try {
      setSavingItem(true);

      const response =
        editingItemId === null
          ? await api.post(
              `/warehouse-transfers/${currentTransfer.id}/items`,
              {
                batch_id: values.batch_id,
                quantity,
              },
            )
          : await api.put(
              `/warehouse-transfers/${currentTransfer.id}/items/${editingItemId}`,
              {
                batch_id: values.batch_id,
                quantity,
              },
            );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            (editingItemId === null
              ? "Không thể thêm thuốc"
              : "Không thể cập nhật thuốc"),
        );
        return;
      }

      await loadTransferDetail(currentTransfer.id, {
        setAsCurrent: true,
      });

      await loadHistory();
      await loadMasterData();

      setEditingItemId(null);
      itemForm.resetFields();

      message.success(
        editingItemId === null
          ? "Đã thêm thuốc vào phiếu"
          : "Đã cập nhật thuốc",
      );
    } catch (error) {
      console.error("Save transfer item:", error);
      message.error("Có lỗi khi lưu thuốc");
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!currentTransfer || !currentEditable) {
      return;
    }

    try {
      const response = await api.delete(
        `/warehouse-transfers/${currentTransfer.id}/items/${itemId}`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message || "Không thể xóa thuốc khỏi phiếu",
        );
        return;
      }

      await loadTransferDetail(currentTransfer.id, {
        setAsCurrent: true,
      });

      await loadHistory();
      await loadMasterData();

      if (editingItemId === itemId) {
        setEditingItemId(null);
        itemForm.resetFields();
      }

      message.success("Đã xóa thuốc khỏi phiếu");
    } catch (error) {
      console.error("Delete transfer item:", error);
      message.error("Có lỗi khi xóa thuốc");
    }
  };

  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmitForApproval = () => {
    if (!currentTransfer) {
      return;
    }

    if (!currentEditable) {
      message.warning("Phiếu hiện tại không thể gửi duyệt");
      return;
    }

    if (items.length === 0) {
      message.warning("Phiếu chuyển kho chưa có thuốc");
      return;
    }

    Modal.confirm({
      title:
        currentTransfer.status === "RETURNED"
          ? "Gửi duyệt lại phiếu chuyển kho?"
          : "Gửi phiếu chuyển kho để duyệt?",
      content:
        "Sau khi gửi duyệt, bạn sẽ không thể sửa phiếu cho đến khi người duyệt trả phiếu về.",
      okText:
        currentTransfer.status === "RETURNED"
          ? "Gửi duyệt lại"
          : "Gửi duyệt",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          setSubmitting(true);

          const response = await api.post(
            `/warehouse-transfers/${currentTransfer.id}/submit`,
          );

          if (response.data?.success !== true) {
            message.error(
              response.data?.message || "Không thể gửi duyệt",
            );
            return;
          }

          await loadTransferDetail(currentTransfer.id, {
            setAsCurrent: true,
          });

          await loadHistory();
          await loadMasterData();

          message.success("Phiếu đã được gửi duyệt");
        } catch (error) {
          console.error("Submit transfer:", error);
          message.error("Có lỗi khi gửi duyệt");
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  /* =========================================================
     HISTORY ACTIONS
  ========================================================= */

  const handleHistorySearch = async () => {
    await loadHistory({
      status: historyStatus,
      search: historySearch,
    });
  };

  const handleResetHistoryFilter = async () => {
    setHistoryStatus(undefined);
    setHistorySearch("");

    await loadHistory({
      status: undefined,
      search: "",
    });
  };

  const handleViewDetail = async (transferId: number) => {
    await loadTransferDetail(transferId, {
      openDrawer: true,
    });
  };

  /* =========================================================
     CURRENT STATUS PANEL
  ========================================================= */

  const renderCurrentStatus = () => {
    if (!currentTransfer) {
      return (
        <Alert
          showIcon
          type="info"
          message="Chưa có phiếu đang làm việc"
          description="Chọn kho nguồn, kho đích và bấm Tạo phiếu. Sau đó bạn có thể thêm nhiều thuốc/lô vào cùng một phiếu."
        />
      );
    }

    switch (currentTransfer.status) {
      case "DRAFT":
        return (
          <Alert
            showIcon
            type="info"
            message="Phiếu đang ở trạng thái Mới"
            description="Bạn có thể sửa thông tin, thêm/sửa/xóa nhiều thuốc rồi gửi duyệt."
          />
        );

      case "RETURNED":
        return (
          <Alert
            showIcon
            type="warning"
            message="Phiếu cần chỉnh sửa"
            description={
              <>
                <div>
                  <b>Lý do:</b>{" "}
                  {currentTransfer.return_reason ||
                    "Người duyệt yêu cầu kiểm tra lại phiếu."}
                </div>

                <div style={{ marginTop: 4 }}>
                  Bạn có thể sửa thông tin, sửa danh sách thuốc và gửi
                  duyệt lại.
                </div>
              </>
            }
          />
        );

      case "PENDING":
        return (
          <Alert
            showIcon
            type="warning"
            message="Phiếu đang chờ duyệt"
            description="Tồn kho chưa thay đổi. Phiếu chỉ được xử lý ở trang Duyệt yêu cầu."
          />
        );

      case "APPROVED":
        return (
          <Alert
            showIcon
            type="success"
            message="Phiếu đã được duyệt"
            description="Tồn kho nguồn đã được trừ, kho đích đã được cộng và lịch sử TRANSFER_OUT/TRANSFER_IN đã được ghi."
          />
        );

      case "COMPLETED":
        return (
          <Alert
            showIcon
            type="info"
            message="Phiếu đã hoàn tất theo luồng cũ"
            description="Đây là dữ liệu lịch sử trước khi áp dụng cơ chế gửi duyệt mới."
          />
        );

      case "CANCELLED":
        return (
          <Alert
            showIcon
            type="error"
            message="Phiếu đã hủy"
            description="Phiếu này chỉ còn dùng để xem lịch sử."
          />
        );

      default:
        return null;
    }
  };

  /* =========================================================
     COLUMNS
  ========================================================= */

  const itemColumns = [
    {
      title: "STT",
      width: 70,
      render: (_: unknown, __: TransferItem, index: number) => index + 1,
    },
    {
      title: "ID lô",
      key: "batch_id",
      width: 90,
      render: (_: unknown, item: TransferItem) =>
        item.batch_id ? <Tag>#{item.batch_id}</Tag> : "-",
    },
    {
      title: "Mã thuốc",
      key: "medicine_code",
      width: 120,
      render: (_: unknown, item: TransferItem) =>
        item.medicine?.medicine_code || "-",
    },
    {
      title: "Tên thuốc",
      key: "medicine_name",
      width: 230,
      render: (_: unknown, item: TransferItem) => (
        <>
          <Text strong>{item.medicine?.name || "-"}</Text>

          {(item.medicine?.strength ||
            item.medicine?.dosage_form) && (
            <>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[item.medicine?.strength, item.medicine?.dosage_form]
                  .filter(Boolean)
                  .join(" - ")}
              </Text>
            </>
          )}
        </>
      ),
    },
    {
      title: "Lô",
      dataIndex: "lot_number",
      key: "lot_number",
      width: 140,
      render: (value: string | undefined) => value || "-",
    },
    {
      title: "HSD",
      dataIndex: "expiry_date",
      key: "expiry_date",
      width: 120,
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: "SL chuyển",
      key: "quantity",
      width: 120,
      render: (_: unknown, item: TransferItem) =>
        `${Number(item.quantity || 0)} ${item.medicine?.unit || ""}`,
    },
    {
      title: "Tồn khả dụng",
      key: "available",
      width: 130,
      render: (_: unknown, item: TransferItem) =>
        `${Number(item.source_available_quantity || 0)} ${
          item.medicine?.unit || ""
        }`,
    },
    {
      title: "Thao tác",
      key: "action",
      fixed: "right" as const,
      width: 150,
      render: (_: unknown, item: TransferItem) =>
        currentEditable ? (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleStartEditItem(item)}
            >
              Sửa
            </Button>

            <Popconfirm
              title="Xóa thuốc khỏi phiếu?"
              description="Thao tác này chỉ xóa dòng thuốc trong phiếu nháp."
              okText="Xóa"
              cancelText="Hủy"
              onConfirm={() => void handleDeleteItem(item.id)}
            >
              <Button
                danger
                type="link"
                size="small"
                icon={<DeleteOutlined />}
              >
                Xóa
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary">Chỉ xem</Text>
        ),
    },
  ];

  const historyColumns = [
    {
      title: "Mã phiếu",
      dataIndex: "transfer_code",
      key: "transfer_code",
      width: 170,
      render: (value: string | null) => (
        <Text strong>{value || "-"}</Text>
      ),
    },
    {
      title: "ID lô",
      key: "batch_ids",
      width: 135,
      align: "center" as const,
      render: (_: unknown, transfer: WarehouseTransfer) => {
        const batchIds =
          transferBatchIds[transfer.id] || [];

        if (batchIds.length === 0) {
          return (
            <Text type="secondary">
              -
            </Text>
          );
        }

        return (
          <Space
            size={[2, 2]}
            wrap
          >
            {batchIds.map((batchId) => (
              <Button
                key={batchId}
                type="link"
                size="small"
                style={{
                  paddingInline: 2,
                  fontWeight: 600,
                }}
                onClick={() => {
                  window.location.href =
                    `/inventory?batch_id=${batchId}`;
                }}
              >
                #{batchId}
              </Button>
            ))}
          </Space>
        );
      },
    },
    {
      title: "Kho nguồn",
      key: "source",
      width: 180,
      render: (_: unknown, transfer: WarehouseTransfer) =>
        transfer.source_warehouse?.name || "-",
    },
    {
      title: "Kho đích",
      key: "destination",
      width: 180,
      render: (_: unknown, transfer: WarehouseTransfer) =>
        transfer.destination_warehouse?.name || "-",
    },
    {
      title: "Số mặt hàng",
      dataIndex: "item_count",
      key: "item_count",
      width: 110,
      render: (value: number | string | undefined) => Number(value || 0),
    },
    {
      title: "Tổng SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 100,
      render: (value: number | string | undefined) => Number(value || 0),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: string | null) => (
        <Tag color={getStatusColor(value)}>{getStatusLabel(value)}</Tag>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: "Thao tác",
      key: "action",
      fixed: "right" as const,
      width: 210,
      render: (_: unknown, transfer: WarehouseTransfer) => (
        <Space>
          <Button
            size="small"
            icon={
              canCreate &&
              isEditableStatus(transfer.status) ? (
                <EditOutlined />
              ) : (
                <EyeOutlined />
              )
            }
            onClick={() => void handleOpenTransfer(transfer.id)}
          >
            {canCreate &&
            isEditableStatus(transfer.status)
              ? "Mở sửa"
              : "Mở phiếu"}
          </Button>

          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => void handleViewDetail(transfer.id)}
          >
            Chi tiết
          </Button>
        </Space>
      ),
    },
  ];

  const drawerItemColumns = [
    {
      title: "Thuốc",
      key: "medicine",
      render: (_: unknown, item: TransferItem) => (
        <>
          <Text strong>{item.medicine?.medicine_code || "-"}</Text>
          <br />
          {item.medicine?.name || "-"}
        </>
      ),
    },
    {
      title: "Lô",
      dataIndex: "lot_number",
      key: "lot_number",
    },
    {
      title: "HSD",
      dataIndex: "expiry_date",
      key: "expiry_date",
      render: (value: string | null) => formatDate(value),
    },
    {
      title: "SL",
      key: "quantity",
      render: (_: unknown, item: TransferItem) =>
        `${Number(item.quantity || 0)} ${item.medicine?.unit || ""}`,
    },
  ];

  /* =========================================================
     UI
  ========================================================= */

  if (!permissionReady) {
    return (
      <Card loading>
        Đang kiểm tra quyền truy cập...
      </Card>
    );
  }

  if (!canView) {
    return (
      <Alert
        showIcon
        type="error"
        message="Bạn không có quyền xem Chuyển kho"
        description="Tài khoản cần quyền TRANSFER_VIEW để truy cập chức năng này."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Chuyển kho
          </Title>

          <Text type="secondary">
            Lập phiếu nhiều thuốc/lô, gửi duyệt và chỉ cập nhật tồn kho
            sau khi được duyệt.
          </Text>
        </div>

        <Space>
          {canCreate && (
            <Button
              icon={<FileAddOutlined />}
              onClick={handleNewTransfer}
            >
              Phiếu mới
            </Button>
          )}

          <Button
            icon={<ReloadOutlined />}
            loading={masterLoading || historyLoading}
            onClick={() => {
              void loadMasterData();
              void loadHistory();
            }}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* =====================================================
          1. HEADER
      ===================================================== */}

      <Card
        style={{
          marginBottom: 16,
          display:
            !canCreate &&
            !currentTransfer
              ? "none"
              : undefined,
        }}
        title={
          currentTransfer
            ? `1. Thông tin phiếu ${
                currentTransfer.transfer_code || `#${currentTransfer.id}`
              }`
            : "1. Tạo phiếu chuyển kho"
        }
        extra={
          currentTransfer ? (
            <Tag color={getStatusColor(currentTransfer.status)}>
              {getStatusLabel(currentTransfer.status)}
            </Tag>
          ) : null
        }
      >
        <Form
          form={headerForm}
          layout="vertical"
          requiredMark={false}
          onFinish={handleCreateOrUpdateHeader}
          disabled={
            !canCreate ||
            Boolean(
              currentTransfer &&
                !currentEditable,
            )
          }
        >
          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item
                label="Kho nguồn"
                name="source_warehouse_id"
                rules={[
                  {
                    required: true,
                    message: "Chọn kho nguồn",
                  },
                ]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={masterLoading}
                  disabled={Boolean(currentTransfer && !currentEditable)}
                  placeholder="Chọn kho nguồn"
                  onChange={handleSourceChange}
                  options={warehouses.map((warehouse) => ({
                    value: warehouse.id,
                    label: `${
                      warehouse.warehouse_code || warehouse.code || "-"
                    } - ${warehouse.name}`,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item
                label="Kho đích"
                name="destination_warehouse_id"
                rules={[
                  {
                    required: true,
                    message: "Chọn kho đích",
                  },
                ]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={masterLoading}
                  disabled={
                    !watchedSourceWarehouseId ||
                    Boolean(currentTransfer && !currentEditable)
                  }
                  placeholder="Chọn kho đích"
                  options={destinationWarehouses.map((warehouse) => ({
                    value: warehouse.id,
                    label: `${
                      warehouse.warehouse_code || warehouse.code || "-"
                    } - ${warehouse.name}`,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item label="Trạng thái">
                <Input
                  disabled
                  value={
                    currentTransfer
                      ? getStatusLabel(currentTransfer.status)
                      : "Chưa tạo"
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              disabled={Boolean(currentTransfer && !currentEditable)}
              placeholder="Ghi chú cho phiếu chuyển kho..."
            />
          </Form.Item>

          <Space wrap>
            {!currentTransfer ? (
              <Button
                type="primary"
                htmlType="submit"
                loading={savingHeader}
                icon={<PlusOutlined />}
              >
                Tạo phiếu
              </Button>
            ) : currentEditable ? (
              <Button
                type="primary"
                htmlType="submit"
                loading={savingHeader}
                icon={<EditOutlined />}
              >
                Lưu thông tin
              </Button>
            ) : null}

            {currentTransfer && (
              <Text type="secondary">
                ID phiếu: {currentTransfer.id}
              </Text>
            )}
          </Space>
        </Form>

        <div style={{ marginTop: 16 }}>{renderCurrentStatus()}</div>
      </Card>

      {/* =====================================================
          2. ITEMS
      ===================================================== */}

      <Card
        title="2. Danh sách thuốc/lô chuyển"
        extra={
          currentTransfer ? (
            <Space>
              <Text type="secondary">{items.length} mặt hàng</Text>
              <Text strong>Tổng SL: {totalCurrentQuantity}</Text>
            </Space>
          ) : null
        }
        style={{ marginBottom: 16 }}
      >
        {!currentTransfer ? (
          <Alert
            showIcon
            type="info"
            message="Hãy tạo phiếu trước khi thêm thuốc"
          />
        ) : (
          <>
            {currentEditable && (
              <Form
                form={itemForm}
                layout="vertical"
                requiredMark={false}
                onFinish={handleSaveItem}
                style={{ marginBottom: 16 }}
              >
                <Row gutter={16}>
                  <Col xs={24} lg={16}>
                    <Form.Item
                      label="Thuốc / lô"
                      name="batch_id"
                      rules={[
                        {
                          required: true,
                          message: "Chọn thuốc/lô",
                        },
                      ]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        disabled={!watchedSourceWarehouseId}
                        placeholder={
                          watchedSourceWarehouseId
                            ? "Chọn thuốc/lô đang có tại kho nguồn"
                            : "Chọn kho nguồn trước"
                        }
                        options={availableBatchOptions
                          .map((inventoryItem) => {
                            const batchId = getBatchId(inventoryItem);

                            if (!batchId) {
                              return null;
                            }

                            return {
                              value: batchId,
                              label: `ID #${getBatchId(
                                inventoryItem,
                              )} - ${getMedicineCode(
                                inventoryItem,
                              )} - ${getMedicineName(
                                inventoryItem,
                              )} - Lô ${getLotNumber(
                                inventoryItem,
                              )} - Khả dụng ${getAvailableQuantity(
                                inventoryItem,
                              )} ${getUnit(inventoryItem)}`,
                            };
                          })
                          .filter(
                            (
                              option,
                            ): option is {
                              value: number;
                              label: string;
                            } => option !== null,
                          )}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} lg={8}>
                    <Form.Item
                      label="Số lượng chuyển"
                      name="quantity"
                      validateTrigger={["onChange", "onBlur"]}
                      validateStatus={
                        quantityValidationMessage ? "error" : undefined
                      }
                      help={quantityValidationMessage || undefined}
                      rules={[
                        {
                          required: true,
                          message: "Nhập số lượng chuyển",
                        },
                        {
                          validator: async (_, value) => {
                            if (
                              value === undefined ||
                              value === null ||
                              value === ""
                            ) {
                              return;
                            }

                            const quantity = Number(value);

                            if (!Number.isFinite(quantity)) {
                              throw new Error("Số lượng không hợp lệ");
                            }

                            if (quantity <= 0) {
                              throw new Error("Số lượng phải lớn hơn 0");
                            }

                            if (!Number.isInteger(quantity)) {
                              throw new Error(
                                "Số lượng phải là số nguyên, không được nhập số thập phân",
                              );
                            }

                            if (
                              selectedInventory &&
                              quantity > maxTransferQuantity
                            ) {
                              throw new Error(
                                `Số lượng vượt tồn khả dụng. Tối đa ${maxTransferQuantity} ${getUnit(
                                  selectedInventory,
                                )}`,
                              );
                            }
                          },
                        },
                      ]}
                    >
                      <InputNumber
                        precision={0}
                        step={1}
                        disabled={!watchedBatchId}
                        style={{ width: "100%" }}
                        placeholder={
                          selectedInventory
                            ? `Nhập từ 1 đến ${maxTransferQuantity} ${getUnit(
                                selectedInventory,
                              )}`
                            : "Nhập số lượng"
                        }
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {selectedInventory && (
                  <Alert
                    showIcon
                    type="success"
                    style={{ marginBottom: 16 }}
                    message={`${getMedicineCode(
                      selectedInventory,
                    )} - ${getMedicineName(selectedInventory)}`}
                    description={
                      <Space wrap>
                        <span>
                          Lô: <b>{getLotNumber(selectedInventory)}</b>
                        </span>

                        <span>
                          HSD:{" "}
                          <b>
                            {formatDate(
                              getExpiryDate(selectedInventory),
                            )}
                          </b>
                        </span>

                        <span>
                          Tồn vật lý:{" "}
                          <b>
                            {getPhysicalQuantity(selectedInventory)}{" "}
                            {getUnit(selectedInventory)}
                          </b>
                        </span>

                        <span>
                          Đang dự trù:{" "}
                          <b>
                            {getReservedQuantity(selectedInventory)}{" "}
                            {getUnit(selectedInventory)}
                          </b>
                        </span>

                        <span>
                          Khả dụng:{" "}
                          <b>
                            {getAvailableQuantity(selectedInventory)}{" "}
                            {getUnit(selectedInventory)}
                          </b>
                        </span>

                        {editingItemId !== null && (
                          <span>
                            Tối đa khi sửa dòng này:{" "}
                            <b>
                              {maxTransferQuantity}{" "}
                              {getUnit(selectedInventory)}
                            </b>
                          </span>
                        )}
                      </Space>
                    }
                  />
                )}

                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={savingItem}
                    icon={
                      editingItemId === null ? (
                        <PlusOutlined />
                      ) : (
                        <EditOutlined />
                      )
                    }
                  >
                    {editingItemId === null
                      ? "Thêm thuốc vào phiếu"
                      : "Lưu chỉnh sửa"}
                  </Button>

                  {editingItemId !== null && (
                    <Button onClick={handleCancelEditItem}>Hủy sửa</Button>
                  )}
                </Space>
              </Form>
            )}

            <Table
              rowKey="id"
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              scroll={{ x: 1050 }}
              locale={{
                emptyText: "Phiếu chưa có thuốc/lô nào",
              }}
            />
          </>
        )}
      </Card>

      {/* =====================================================
          3. SUBMIT
      ===================================================== */}

      <Card title="3. Gửi duyệt" style={{ marginBottom: 16 }}>
        {!currentTransfer ? (
          <Alert
            showIcon
            type="info"
            message="Chưa có phiếu để gửi duyệt"
          />
        ) : currentEditable ? (
          <>
            <Alert
              showIcon
              type={
                currentTransfer.status === "RETURNED"
                  ? "warning"
                  : "info"
              }
              message={
                currentTransfer.status === "RETURNED"
                  ? "Phiếu đã được trả về chỉnh sửa"
                  : "Phiếu đang được soạn"
              }
              description={
                currentTransfer.status === "RETURNED"
                  ? "Kiểm tra lại nội dung theo lý do trả về, sau đó gửi duyệt lại. Số lượng trong phiếu vẫn đang được dự trù và làm giảm tồn khả dụng."
                  : "Ngay khi thêm thuốc vào phiếu, số lượng đã được dự trù và tồn khả dụng giảm. Sau khi gửi duyệt, phiếu bị khóa chỉnh sửa cho đến khi được duyệt hoặc trả về."
              }
              style={{ marginBottom: 16 }}
            />

            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              disabled={items.length === 0}
              onClick={handleSubmitForApproval}
            >
              {currentTransfer.status === "RETURNED"
                ? "Gửi duyệt lại"
                : "Gửi duyệt"}
            </Button>
          </>
        ) : currentTransfer.status === "PENDING" ? (
          <Alert
            showIcon
            type="warning"
            message="Phiếu đang chờ duyệt"
            description={`Đã gửi lúc ${formatDateTime(
              currentTransfer.submitted_at,
            )}. Tồn kho chưa thay đổi.`}
          />
        ) : currentTransfer.status === "APPROVED" ? (
          <Alert
            showIcon
            type="success"
            message="Phiếu đã được duyệt và chuyển kho"
            description={`Người duyệt: ${getUserLabel(
              currentTransfer.approved_by,
            )} • Thời gian: ${formatDateTime(
              currentTransfer.approved_at,
            )}`}
          />
        ) : (
          <Alert
            showIcon
            type="info"
            message={getStatusLabel(currentTransfer.status)}
            description="Phiếu này không còn thao tác gửi duyệt."
          />
        )}
      </Card>

      {/* =====================================================
          4. HISTORY
      ===================================================== */}

      <Card
        title="4. Danh sách phiếu chuyển kho"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={historyLoading}
            onClick={() => void loadHistory()}
          >
            Làm mới
          </Button>
        }
      >
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={10}>
            <Input
              allowClear
              value={historySearch}
              prefix={<SearchOutlined />}
              placeholder="Mã phiếu, ghi chú, kho, người tạo..."
              onChange={(event) => setHistorySearch(event.target.value)}
              onPressEnter={() => void handleHistorySearch()}
            />
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Select
              allowClear
              value={historyStatus}
              placeholder="Trạng thái"
              style={{ width: "100%" }}
              onChange={setHistoryStatus}
              options={[
                {
                  value: "DRAFT",
                  label: "Mới",
                },
                {
                  value: "PENDING",
                  label: "Chờ duyệt",
                },
                {
                  value: "RETURNED",
                  label: "Cần chỉnh sửa",
                },
                {
                  value: "APPROVED",
                  label: "Đã duyệt",
                },
                {
                  value: "COMPLETED",
                  label: "Đã hoàn tất (cũ)",
                },
                {
                  value: "CANCELLED",
                  label: "Đã hủy",
                },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <Space wrap>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => void handleHistorySearch()}
              >
                Tìm kiếm
              </Button>

              <Button onClick={() => void handleResetHistoryFilter()}>
                Làm mới bộ lọc
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={historyColumns}
          dataSource={transfers}
          loading={historyLoading}
          scroll={{ x: 1250 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `Tổng ${total} phiếu`,
          }}
        />
      </Card>

      {/* =====================================================
          DETAIL DRAWER
      ===================================================== */}

      <Drawer
        title={
          detailTransfer
            ? `Chi tiết ${
                detailTransfer.transfer_code || `#${detailTransfer.id}`
              }`
            : "Chi tiết phiếu chuyển kho"
        }
        width={820}
        open={drawerOpen}
        loading={detailLoading}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setDetailTransfer(null);
        }}
      >
        {detailTransfer && (
          <>
            {detailTransfer.status === "RETURNED" && (
              <Alert
                showIcon
                type="warning"
                message="Phiếu cần chỉnh sửa"
                description={detailTransfer.return_reason || "-"}
                style={{ marginBottom: 16 }}
              />
            )}

            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Mã phiếu">
                {detailTransfer.transfer_code || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag color={getStatusColor(detailTransfer.status)}>
                  {getStatusLabel(detailTransfer.status)}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Kho nguồn">
                {detailTransfer.source_warehouse?.name || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Kho đích">
                {detailTransfer.destination_warehouse?.name || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Người tạo">
                {getUserLabel(detailTransfer.created_by)}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày tạo">
                {formatDateTime(detailTransfer.created_at)}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày gửi duyệt">
                {formatDateTime(detailTransfer.submitted_at)}
              </Descriptions.Item>

              {detailTransfer.status === "RETURNED" && (
                <>
                  <Descriptions.Item label="Người trả về">
                    {getUserLabel(detailTransfer.returned_by)}
                  </Descriptions.Item>

                  <Descriptions.Item label="Ngày trả về">
                    {formatDateTime(detailTransfer.returned_at)}
                  </Descriptions.Item>

                  <Descriptions.Item label="Lý do trả về">
                    {detailTransfer.return_reason || "-"}
                  </Descriptions.Item>
                </>
              )}

              {detailTransfer.status === "APPROVED" && (
                <>
                  <Descriptions.Item label="Người duyệt">
                    {getUserLabel(detailTransfer.approved_by)}
                  </Descriptions.Item>

                  <Descriptions.Item label="Ngày duyệt">
                    {formatDateTime(detailTransfer.approved_at)}
                  </Descriptions.Item>
                </>
              )}

              <Descriptions.Item label="Ghi chú">
                {detailTransfer.note || "-"}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 24 }}>
              Danh sách thuốc/lô
            </Title>

            <Table
              rowKey="id"
              columns={drawerItemColumns}
              dataSource={detailTransfer.items || []}
              pagination={false}
              scroll={{ x: 650 }}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}

export default WarehouseTransfers;
