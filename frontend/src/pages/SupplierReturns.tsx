import { useEffect, useMemo, useState } from "react";

import axios from "axios";

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
  Steps,
  Table,
  Tag,
  Typography,
} from "antd";

import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================
   TYPES
========================= */

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
}

interface Medicine {
  id: number;
  medicine_code?: string;
  name?: string;

  supplier_id?: number;

  supplier?: {
    id?: number;
    name?: string;
  };
}

interface InventoryItem {
  id?: number;

  warehouse_id?: number;
  warehouse_name?: string;

  warehouse?: {
    id?: number;
    name?: string;
  };

  medicine_id?: number;
  medicine_code?: string;
  medicine_name?: string;

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    unit?: string | null;

    supplier_id?: number;

    supplier?: {
      id?: number;
      name?: string;
    };
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

  unit?: string | null;

  supplier_id?: number;
}

interface ReturnHeaderValues {
  supplier_id: number;
  warehouse_id: number;
  reason: string;
  note?: string;
}

interface ReturnItemValues {
  batch_id: number;
  quantity: number;
}

interface ReturnItem {
  id?: number;

  batch_id?: number;

  medicine_code?: string;
  medicine_name?: string;

  medicine?: {
    medicine_code?: string;
    name?: string;
    unit?: string | null;
  };

  lot_number?: string;
  expiry_date?: string | null;

  batch?: {
    lot_number?: string;
    expiry_date?: string | null;
  };

  quantity?: number | string;
}

interface SupplierReturn {
  id: number;

  return_code?: string;

  supplier_id?: number;
  supplier_name?: string;

  supplier?: {
    id?: number;
    name?: string;
  };

  warehouse_id?: number;
  warehouse_name?: string;

  warehouse?: {
    id?: number;
    name?: string;
  };

  reason?: string | null;
  note?: string | null;

  status: string;

  rejection_reason?: string | null;

  created_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;

  items?: ReturnItem[];
}

/* =========================
   MODULE HELPERS
========================= */

function normalizeArray<T>(data: unknown, keys: string[]): T[] {
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

function getWarehouseId(item: InventoryItem) {
  return item.warehouse?.id ?? item.warehouse_id;
}

function getWarehouseName(item: InventoryItem) {
  return item.warehouse?.name || item.warehouse_name || "-";
}

function getMedicineId(item: InventoryItem) {
  return item.medicine?.id ?? item.medicine_id;
}

function getBatchId(item: InventoryItem) {
  return item.batch?.id ?? item.batch_id;
}

function getLotNumber(item: InventoryItem) {
  return item.batch?.lot_number || item.lot_number || "-";
}

function getMedicineCode(item: InventoryItem) {
  return item.medicine?.medicine_code || item.medicine_code || "-";
}

function getMedicineName(item: InventoryItem) {
  return item.medicine?.name || item.medicine_name || "-";
}

function getUnit(item: InventoryItem) {
  return item.medicine?.unit || item.unit || "";
}

function getQuantity(item: InventoryItem) {
  return Number(
    item.available_quantity ??
      item.quantity ??
      item.stock_quantity ??
      0,
  );
}

function getStatusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "Mới";

    case "PENDING":
      return "Chờ duyệt";

    case "APPROVED":
      return "Đã duyệt";

    case "REJECTED":
      return "Từ chối";

    default:
      return status || "-";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "DRAFT":
      return "blue";

    case "PENDING":
      return "gold";

    case "APPROVED":
      return "green";

    case "REJECTED":
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

/* =========================
   COMPONENT
========================= */

function SupplierReturns() {
  const [headerForm] = Form.useForm<ReturnHeaderValues>();

  const [itemForm] = Form.useForm<ReturnItemValues>();

  /* =========================
     DATA
  ========================= */

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  const [returns, setReturns] = useState<SupplierReturn[]>([]);

  const [returnBatchMap, setReturnBatchMap] =
    useState<Record<number, number[]>>({});

  /* =========================
     CURRENT RETURN
  ========================= */

  const [returnId, setReturnId] = useState<number | null>(null);

  const [returnCode, setReturnCode] = useState("");

  const [returnStatus, setReturnStatus] = useState("");

  const [selectedSupplierId, setSelectedSupplierId] = useState<
    number | undefined
  >();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<
    number | undefined
  >();

  const [items, setItems] = useState<ReturnItem[]>([]);

  /* =========================
     LOADING
  ========================= */

  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);

  const [addingItem, setAddingItem] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingOriginalBatchId, setEditingOriginalBatchId] = useState<number | null>(null);
  const [editingOriginalQuantity, setEditingOriginalQuantity] = useState(0);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [approving, setApproving] = useState(false);

  /* =========================
     DETAIL DRAWER
  ========================= */

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [detailLoading, setDetailLoading] = useState(false);

  const [selectedReturn, setSelectedReturn] = useState<SupplierReturn | null>(
    null,
  );

  /* =========================
     REJECT
  ========================= */

  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const [rejectReason, setRejectReason] = useState("");

  const [rejecting, setRejecting] = useState(false);

  /* =========================
     INITIAL LOAD
  ========================= */

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const [
          supplierResponse,
          medicineResponse,
          inventoryResponse,
          returnResponse,
        ] = await Promise.all([
          api.get("/suppliers", {
            params: {
              is_active: true,
            },
          }),

          api.get("/medicines"),

          api.get("/inventory/availability"),

          api.get("/supplier-returns"),
        ]);

        if (cancelled) {
          return;
        }

        setSuppliers(
          normalizeArray<Supplier>(supplierResponse.data, [
            "data",
            "suppliers",
          ]),
        );

        setMedicines(
          normalizeArray<Medicine>(medicineResponse.data, [
            "data",
            "medicines",
          ]),
        );

        setInventory(
          normalizeArray<InventoryItem>(inventoryResponse.data, [
            "data",
            "inventory",
          ]),
        );

        const loadedReturns =
          normalizeArray<SupplierReturn>(
            returnResponse.data,
            [
              "data",
              "returns",
              "supplier_returns",
            ],
          );

        setReturns(
          loadedReturns,
        );

        await loadSupplierReturnBatchMap(
          loadedReturns,
        );
      } catch (error) {
        console.error("Initial supplier returns:", error);

        if (!cancelled) {
          message.error("Không thể tải dữ liệu Trả NCC");
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================
     MEDICINE -> SUPPLIER MAP
  ========================= */

  const medicineSupplierMap = useMemo(() => {
    const map = new Map<number, number>();

    medicines.forEach((medicine) => {
      const supplierId = medicine.supplier?.id ?? medicine.supplier_id;

      if (supplierId) {
        map.set(medicine.id, supplierId);
      }
    });

    return map;
  }, [medicines]);

  /* =========================
     WAREHOUSE OPTIONS
  ========================= */

  const warehouses = useMemo(() => {
    const map = new Map<number, string>();

    inventory.forEach((item) => {
      const id = getWarehouseId(item);

      if (id) {
        map.set(id, getWarehouseName(item));
      }
    });

    return Array.from(map.entries()).map(([id, name]) => ({
      id,
      name,
    }));
  }, [inventory]);

  /* =========================
     AVAILABLE BATCHES
  ========================= */

  const availableBatches = useMemo(() => {
    if (!selectedWarehouseId) {
      return [];
    }

    return inventory.filter((item) => {
      if (getWarehouseId(item) !== selectedWarehouseId) {
        return false;
      }

      const batchId = getBatchId(item);

      if (
        getQuantity(item) <= 0 &&
        !(editingItemId !== null && batchId === editingOriginalBatchId)
      ) {
        return false;
      }

      if (!selectedSupplierId) {
        return true;
      }

      const directSupplierId =
        item.medicine?.supplier?.id ??
        item.medicine?.supplier_id ??
        item.supplier_id;

      if (directSupplierId) {
        return directSupplierId === selectedSupplierId;
      }

      const medicineId = getMedicineId(item);

      if (!medicineId) {
        return true;
      }

      const mappedSupplierId = medicineSupplierMap.get(medicineId);

      if (!mappedSupplierId) {
        return true;
      }

      return mappedSupplierId === selectedSupplierId;
    });
  }, [
    inventory,
    medicineSupplierMap,
    selectedSupplierId,
    selectedWarehouseId,
    editingItemId,
    editingOriginalBatchId,
  ]);

  /* =========================
     RELOAD LIST + INVENTORY
  ========================= */

  const loadSupplierReturnBatchMap = async (
    returnList: SupplierReturn[],
  ) => {
    const results = await Promise.all(
      returnList.map(async (record) => {
        try {
          const response =
            await api.get(
              `/supplier-returns/${record.id}`,
            );

          const data = response.data;

          const detail =
            (data.supplier_return ||
              data.return ||
              data.data) as
              | SupplierReturn
              | undefined;

          const detailItems =
            Array.isArray(data.items)
              ? (data.items as ReturnItem[])
              : detail?.items || [];

          const batchIds =
            Array.from(
              new Set(
                detailItems
                  .map((item) =>
                    Number(
                      item.batch_id,
                    ),
                  )
                  .filter(
                    (batchId) =>
                      Number.isFinite(
                        batchId,
                      ) &&
                      batchId > 0,
                  ),
              ),
            );

          return [
            record.id,
            batchIds,
          ] as const;
        } catch (error) {
          console.error(
            `Load batch IDs for supplier return ${record.id}:`,
            error,
          );

          return [
            record.id,
            [] as number[],
          ] as const;
        }
      }),
    );

    setReturnBatchMap(
      Object.fromEntries(results) as Record<
        number,
        number[]
      >,
    );
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [inventoryResponse, returnResponse] = await Promise.all([
        api.get("/inventory/availability"),

        api.get("/supplier-returns"),
      ]);

      setInventory(
        normalizeArray<InventoryItem>(inventoryResponse.data, [
          "data",
          "inventory",
        ]),
      );

      const loadedReturns =
        normalizeArray<SupplierReturn>(
          returnResponse.data,
          [
            "data",
            "returns",
            "supplier_returns",
          ],
        );

      setReturns(
        loadedReturns,
      );

      await loadSupplierReturnBatchMap(
        loadedReturns,
      );
    } catch (error) {
      console.error("Reload supplier returns:", error);

      message.error("Không thể tải lại dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     LOAD RETURN DETAIL
  ========================= */

  const reloadReturn = async (id: number) => {
    try {
      const response = await api.get(`/supplier-returns/${id}`);

      const data = response.data;

      if (data.success !== true) {
        message.error(data.message || "Không thể tải phiếu trả");

        return null;
      }

      const value = (data.supplier_return ||
        data.return ||
        data.data) as SupplierReturn;

      if (!value) {
        message.error("Không tìm thấy phiếu trả NCC");

        return null;
      }

      setReturnId(value.id || id);

      setReturnCode(value.return_code || "");

      setReturnStatus(value.status || "");

      const detailItems = Array.isArray(data.items)
        ? data.items
        : value.items || [];

      setItems(detailItems);

      return {
        value,
        items: detailItems,
      };
    } catch (error) {
      console.error("Reload return:", error);

      message.error("Không thể tải chi tiết phiếu trả");

      return null;
    }
  };

  /* =========================
     CREATE RETURN
  ========================= */

  const handleCreateReturn = async (values: ReturnHeaderValues) => {
    try {
      setCreating(true);

      const response = await api.post("/supplier-returns", {
        supplier_id: values.supplier_id,

        warehouse_id: values.warehouse_id,

        reason: values.reason.trim(),

        note: values.note?.trim() || null,
      });

      const data = response.data;

      if (data.success !== true) {
        message.error(data.message || "Không thể tạo phiếu trả");

        return;
      }

      const newReturnId = Number(data.return_id ?? data.supplier_return_id);

      if (!Number.isFinite(newReturnId) || newReturnId <= 0) {
        message.error("Không nhận được ID phiếu trả hợp lệ");

        return;
      }

      setReturnId(newReturnId);

      setReturnStatus("DRAFT");

      setSelectedSupplierId(values.supplier_id);

      setSelectedWarehouseId(values.warehouse_id);

      await reloadReturn(newReturnId);

      await loadData();

      message.success("Tạo phiếu trả NCC thành công");
    } catch (error) {
      console.error("Create supplier return:", error);

      message.error("Có lỗi khi tạo phiếu trả");
    } finally {
      setCreating(false);
    }
  };

  /* =========================
     OPEN EXISTING RETURN
  ========================= */

  const handleOpenReturn = async (record: SupplierReturn) => {
    try {
      const detail = await reloadReturn(record.id);

      const value = detail?.value || record;

      const supplierId = value.supplier?.id ?? value.supplier_id;

      const warehouseId = value.warehouse?.id ?? value.warehouse_id;

      setSelectedSupplierId(supplierId);

      setSelectedWarehouseId(warehouseId);

      headerForm.setFieldsValue({
        supplier_id: supplierId || 0,

        warehouse_id: warehouseId || 0,

        reason: value.reason || "",

        note: value.note || "",
      });

      itemForm.resetFields();
    } catch (error) {
      console.error("Open return:", error);

      message.error("Không thể mở phiếu trả");
    }
  };

  const getMaxQuantityForBatch = (batchId: number) => {
    const inventoryItem = availableBatches.find(
      (item) => getBatchId(item) === batchId,
    );

    const currentAvailable = inventoryItem
      ? getQuantity(inventoryItem)
      : 0;

    if (
      editingItemId !== null &&
      editingOriginalBatchId === batchId
    ) {
      return currentAvailable + editingOriginalQuantity;
    }

    return currentAvailable;
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditingOriginalBatchId(null);
    setEditingOriginalQuantity(0);
    itemForm.resetFields();
  };

  const startEditItem = (item: ReturnItem) => {
    if (!item.id) {
      message.warning("Dòng thuốc không có ID để chỉnh sửa");
      return;
    }

    const batchId = item.batch_id;
    const quantity = Number(item.quantity || 0);

    if (!batchId) {
      message.warning("Không xác định được lô thuốc");
      return;
    }

    setEditingItemId(item.id);
    setEditingOriginalBatchId(batchId);
    setEditingOriginalQuantity(quantity);

    itemForm.setFieldsValue({
      batch_id: batchId,
      quantity,
    });
  };

  /* =========================
     ADD / UPDATE ITEM
  ========================= */

  const handleSaveItem = async (values: ReturnItemValues) => {
    if (!returnId) {
      message.warning("Chưa có phiếu trả");

      return;
    }

    if (returnStatus !== "DRAFT") {
      message.warning("Chỉ phiếu Nháp mới được thêm thuốc");

      return;
    }

    const inventoryItem = availableBatches.find(
      (item) => getBatchId(item) === values.batch_id,
    );

    if (!inventoryItem) {
      message.warning("Không tìm thấy lô trong kho");

      return;
    }

    const quantity = Number(values.quantity);

    if (!Number.isInteger(quantity)) {
      message.warning("Số lượng trả phải là số nguyên");

      return;
    }

    if (quantity <= 0) {
      message.warning("Số lượng trả phải lớn hơn 0");

      return;
    }

    const maxQuantity = getMaxQuantityForBatch(values.batch_id);

    if (quantity > maxQuantity) {
      message.warning(
        `Số lượng trả vượt tồn khả dụng. Có thể dùng tối đa ${maxQuantity} ${getUnit(inventoryItem)}`,
      );
      return;
    }

    try {
      setAddingItem(true);

      const response = editingItemId
        ? await api.put(
            `/supplier-returns/${returnId}/items/${editingItemId}`,
            {
              batch_id: values.batch_id,
              quantity,
            },
          )
        : await api.post(`/supplier-returns/${returnId}/items`, {
            batch_id: values.batch_id,
            quantity,
          });

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể thêm thuốc");

        return;
      }

      cancelEditItem();

      await reloadReturn(returnId);
      await loadData();

      message.success(
        editingItemId
          ? "Đã cập nhật thuốc trong phiếu trả"
          : "Đã thêm thuốc vào phiếu trả",
      );
    } catch (error) {
      console.error("Add return item:", error);

      const detail = axios.isAxiosError(error)
        ? error.response?.data?.detail
        : null;

      message.error(detail || "Có lỗi khi lưu thuốc");
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = async (item: ReturnItem) => {
    if (!returnId || !item.id) {
      return;
    }

    try {
      setDeletingItemId(item.id);

      const response = await api.delete(
        `/supplier-returns/${returnId}/items/${item.id}`,
      );

      if (response.data?.success !== true) {
        message.error(response.data?.message || "Không thể xóa thuốc");
        return;
      }

      if (editingItemId === item.id) {
        cancelEditItem();
      }

      await reloadReturn(returnId);
      await loadData();
      message.success("Đã xóa thuốc khỏi phiếu trả");
    } catch (error) {
      console.error("Delete supplier return item:", error);
      const detail = axios.isAxiosError(error)
        ? error.response?.data?.detail
        : null;
      message.error(detail || "Có lỗi khi xóa thuốc");
    } finally {
      setDeletingItemId(null);
    }
  };

  /* =========================
     SUBMIT
  ========================= */

  const handleSubmit = async () => {
    if (!returnId) {
      return;
    }

    if (items.length === 0) {
      message.warning("Phiếu chưa có thuốc");

      return;
    }

    try {
      setSubmitting(true);

      const response = await api.post(`/supplier-returns/${returnId}/submit`);

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể gửi duyệt");

        return;
      }

      await reloadReturn(returnId);

      await loadData();

      message.success("Phiếu trả đã được gửi duyệt");
    } catch (error) {
      console.error("Submit supplier return:", error);

      message.error("Có lỗi khi gửi duyệt");
    } finally {
      setSubmitting(false);
    }
  };

  /* =========================
     APPROVE
  ========================= */

  const handleApprove = async (id: number) => {
    try {
      setApproving(true);

      const response = await api.post(`/supplier-returns/${id}/approve`);

      if (response.data.success !== true) {
        message.error(response.data.message || "Duyệt phiếu thất bại");

        return;
      }

      message.success("Duyệt trả NCC thành công");

      if (returnId === id) {
        await reloadReturn(id);
      }

      await loadData();
    } catch (error) {
      console.error("Approve supplier return:", error);

      message.error("Có lỗi khi duyệt phiếu");
    } finally {
      setApproving(false);
    }
  };

  /* =========================
     REJECT
  ========================= */

  const handleReject = async () => {
    if (!returnId) {
      message.warning("Chưa chọn phiếu trả");

      return;
    }

    const reason = rejectReason.trim();

    if (!reason) {
      message.warning("Vui lòng nhập lý do từ chối");

      return;
    }

    try {
      setRejecting(true);

      let response;

      try {
        response = await api.post(`/supplier-returns/${returnId}/reject`, {
          rejection_reason: reason,
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 422) {
          response = await api.post(`/supplier-returns/${returnId}/reject`, {
            reason,
          });
        } else {
          throw error;
        }
      }

      if (response.data.success !== true) {
        message.error(response.data.message || "Từ chối phiếu thất bại");

        return;
      }

      setRejectModalOpen(false);

      setRejectReason("");

      await reloadReturn(returnId);

      await loadData();

      message.success("Đã trả phiếu về trạng thái Mới. Có thể chỉnh sửa và gửi duyệt lại.");
    } catch (error) {
      console.error("Reject supplier return:", error);

      message.error("Có lỗi khi từ chối phiếu");
    } finally {
      setRejecting(false);
    }
  };

  /* =========================
     DETAIL DRAWER
  ========================= */

  const handleViewDetail = async (id: number) => {
    try {
      setDrawerOpen(true);

      setDetailLoading(true);

      const response = await api.get(`/supplier-returns/${id}`);

      const data = response.data;

      if (data.success !== true) {
        message.error(data.message || "Không thể tải chi tiết");

        setDrawerOpen(false);

        return;
      }

      const value = (data.supplier_return ||
        data.return ||
        data.data) as SupplierReturn;

      if (!value) {
        message.error("Không tìm thấy phiếu trả");

        setDrawerOpen(false);

        return;
      }

      setSelectedReturn({
        ...value,

        items: Array.isArray(data.items) ? data.items : value.items || [],
      });
    } catch (error) {
      console.error("View supplier return:", error);

      message.error("Không thể tải chi tiết phiếu trả");

      setDrawerOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  /* =========================
     NEW
  ========================= */

  const handleNew = () => {
    setReturnId(null);

    setReturnCode("");

    setReturnStatus("");

    setSelectedSupplierId(undefined);

    setSelectedWarehouseId(undefined);

    setItems([]);

    setRejectReason("");
    setEditingItemId(null);
    setEditingOriginalBatchId(null);
    setEditingOriginalQuantity(0);

    headerForm.resetFields();

    itemForm.resetFields();
  };

  /* =========================
     ITEM TABLE
  ========================= */

  const itemColumns = [
    {
      title: "Thuốc",

      key: "medicine",

      render: (_: unknown, item: ReturnItem) => (
        <div>
          <Text strong>
            {item.medicine?.medicine_code || item.medicine_code || "-"}
          </Text>

          <br />

          <Text>{item.medicine?.name || item.medicine_name || "-"}</Text>
        </div>
      ),
    },

    {
      title: "Lô",

      key: "lot",

      render: (_: unknown, item: ReturnItem) =>
        item.batch?.lot_number || item.lot_number || "-",
    },

    {
      title: "HSD",

      key: "expiry",

      render: (_: unknown, item: ReturnItem) => {
        const value = item.batch?.expiry_date || item.expiry_date;

        if (!value) {
          return "-";
        }

        const date = dayjs(value);

        return date.isValid() ? date.format("DD/MM/YYYY") : value;
      },
    },

    {
      title: "Số lượng trả",
      dataIndex: "quantity",
      key: "quantity",
    },
    {
      title: "Thao tác",
      key: "item_actions",
      width: 170,
      render: (_: unknown, item: ReturnItem) =>
        returnStatus === "DRAFT" ? (
          <Space size={4}>
            <Button
              size="small"
              type="link"
              icon={<EditOutlined />}
              onClick={() => startEditItem(item)}
            >
              Sửa
            </Button>

            <Popconfirm
              title="Xóa thuốc khỏi phiếu?"
              description="Số lượng dự trù của dòng này sẽ được giải phóng."
              okText="Xóa"
              cancelText="Hủy"
              onConfirm={() => void handleDeleteItem(item)}
            >
              <Button
                size="small"
                type="link"
                danger
                icon={<DeleteOutlined />}
                loading={deletingItemId === item.id}
              >
                Xóa
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  /* =========================
     RETURN LIST TABLE
  ========================= */

  const returnColumns = [
    {
      title: "Mã trả",

      dataIndex: "return_code",

      key: "return_code",

      render: (value: string) => <Text strong>{value || "-"}</Text>,
    },

    {
      title: "ID lô",
      key: "batch_ids",
      width: 115,
      align: "center" as const,
      render: (
        _: unknown,
        record: SupplierReturn,
      ) => {
        const batchIds =
          returnBatchMap[
            record.id
          ] || [];

        if (
          batchIds.length === 0
        ) {
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
            {batchIds.map(
              (batchId) => (
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
              ),
            )}
          </Space>
        );
      },
    },

    {
      title: "Nhà cung cấp",

      key: "supplier",

      render: (_: unknown, record: SupplierReturn) =>
        record.supplier?.name || record.supplier_name || "-",
    },

    {
      title: "Kho",

      key: "warehouse",

      render: (_: unknown, record: SupplierReturn) =>
        record.warehouse?.name || record.warehouse_name || "-",
    },

    {
      title: "Lý do",

      dataIndex: "reason",

      key: "reason",

      render: (value: string | null) => value || "-",
    },

    {
      title: "Trạng thái",

      dataIndex: "status",

      key: "status",

      render: (value: string) => (
        <Tag color={getStatusColor(value)}>{getStatusLabel(value)}</Tag>
      ),
    },

    {
      title: "Thao tác",

      key: "actions",

      render: (_: unknown, record: SupplierReturn) => (
        <Space wrap>
          {record.status === "DRAFT" && (
            <Button
              type="primary"
              onClick={() => void handleOpenReturn(record)}
            >
              Tiếp tục
            </Button>
          )}

          {record.status === "PENDING" && (
            <Button
              type="primary"
              onClick={() => void handleOpenReturn(record)}
            >
              Xử lý
            </Button>
          )}

          <Button
            icon={<EyeOutlined />}
            onClick={() => void handleViewDetail(record.id)}
          >
            Chi tiết
          </Button>
        </Space>
      ),
    },
  ];

  /* =========================
     STEP
  ========================= */

  let currentStep = 0;

  if (returnId && returnStatus === "DRAFT") {
    currentStep = 1;
  }

  if (returnId && returnStatus !== "DRAFT") {
    currentStep = 2;
  }

  /* =========================
     UI
  ========================= */

  return (
    <div>
      {/* HEADER */}

      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "flex-start",

          marginBottom: 24,

          gap: 16,
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              marginBottom: 4,
            }}
          >
            Trả nhà cung cấp
          </Title>

          <Text type="secondary">
            Tạo và xử lý phiếu trả thuốc cho nhà cung cấp
          </Text>
        </div>

        <Space>
          {returnId && (
            <Button icon={<PlusOutlined />} onClick={handleNew}>
              Tạo phiếu mới
            </Button>
          )}

          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void loadData()}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* RULE */}

      <Alert
        type="info"
        showIcon
        style={{
          marginBottom: 16,
        }}
        message="Quy tắc trả nhà cung cấp"
        description="Tạo phiếu và gửi duyệt chưa làm giảm tồn kho. Chỉ khi phiếu được duyệt, số lượng thuốc mới bị trừ khỏi kho."
      />

      {/* STEPS */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Steps
          current={currentStep}
          items={[
            {
              title: "Thông tin phiếu",
            },

            {
              title: "Thêm thuốc",
            },

            {
              title: "Xử lý duyệt",
            },
          ]}
        />
      </Card>

      {/* CURRENT STATUS */}

      {returnId && (
        <Alert
          showIcon
          style={{
            marginBottom: 16,
          }}
          type={
            returnStatus === "APPROVED"
              ? "success"
              : returnStatus === "REJECTED"
                ? "error"
                : returnStatus === "PENDING"
                  ? "warning"
                  : "info"
          }
          message={
            <Space>
              <Text strong>{returnCode || `Phiếu #${returnId}`}</Text>

              <Tag color={getStatusColor(returnStatus)}>
                {getStatusLabel(returnStatus)}
              </Tag>
            </Space>
          }
        />
      )}

      {/* HEADER FORM */}

      <Card
        title="1. Thông tin phiếu trả"
        style={{
          marginBottom: 16,
        }}
      >
        <Form
          form={headerForm}
          layout="vertical"
          requiredMark={false}
          disabled={returnId !== null}
          onFinish={handleCreateReturn}
        >
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item
                label="Nhà cung cấp"
                name="supplier_id"
                rules={[
                  {
                    required: true,

                    message: "Vui lòng chọn nhà cung cấp",
                  },
                ]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn nhà cung cấp"
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,

                    label: `${supplier.supplier_code} - ${supplier.name}`,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item
                label="Kho trả"
                name="warehouse_id"
                rules={[
                  {
                    required: true,

                    message: "Vui lòng chọn kho trả",
                  },
                ]}
              >
                <Select
                  placeholder="Chọn kho"
                  options={warehouses.map((warehouse) => ({
                    value: warehouse.id,

                    label: warehouse.name,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Lý do trả"
            name="reason"
            rules={[
              {
                required: true,

                message: "Vui lòng nhập lý do trả",
              },
            ]}
          >
            <Input placeholder="Ví dụ: Thuốc bị lỗi bao bì" />
          </Form.Item>

          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder="Ghi chú nếu có"
            />
          </Form.Item>

          {!returnId && (
            <Button type="primary" htmlType="submit" loading={creating}>
              Tạo phiếu trả
            </Button>
          )}
        </Form>
      </Card>

      {/* ITEMS */}

      {returnId && (
        <Card
          title="2. Thuốc trả nhà cung cấp"
          style={{
            marginBottom: 16,
          }}
        >
          {returnStatus === "DRAFT" && (
            <Form
              form={itemForm}
              layout="vertical"
              requiredMark={false}
              onFinish={handleSaveItem}
            >
              <Row gutter={16}>
                <Col xs={24} lg={16}>
                  <Form.Item
                    label="Lô thuốc"
                    name="batch_id"
                    rules={[
                      {
                        required: true,

                        message: "Vui lòng chọn lô thuốc",
                      },
                    ]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Chọn lô đang tồn trong kho"
                      options={availableBatches
                        .map((item) => {
                          const batchId = getBatchId(item);

                          if (batchId === undefined) {
                            return null;
                          }

                          return {
                            value: batchId,

                            label: `#${getMedicineId(item) || "-"} | ${getMedicineCode(item)} - ${getMedicineName(item)} - Lô ${getLotNumber(item)} - Khả dụng ${getQuantity(item)} ${getUnit(item)}`,
                          };
                        })
                        .filter(
                          (
                            item,
                          ): item is {
                            value: number;

                            label: string;
                          } => item !== null,
                        )}
                    
                      onChange={() => {
                        if (
                          itemForm.getFieldValue(
                            "quantity",
                          ) !== undefined
                        ) {
                          void itemForm.validateFields(
                            ["quantity"],
                          );
                        }
                      }}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={8}>
                  <Form.Item
                    label="Số lượng trả"
                    name="quantity"
                    validateTrigger={[
                      "onChange",
                      "onBlur",
                    ]}
                    rules={[
                      {
                        required: true,
                        message:
                          "Vui lòng nhập số lượng",
                      },
                      {
                        validator: async (
                          _,
                          value,
                        ) => {
                          if (
                            value ===
                              undefined ||
                            value === null ||
                            value === ""
                          ) {
                            return Promise.resolve();
                          }

                          const quantity =
                            Number(value);

                          if (
                            !Number.isFinite(
                              quantity,
                            )
                          ) {
                            throw new Error(
                              "Số lượng không hợp lệ",
                            );
                          }

                          if (
                            !Number.isInteger(
                              quantity,
                            )
                          ) {
                            throw new Error(
                              "Số lượng phải là số nguyên",
                            );
                          }

                          if (
                            quantity <= 0
                          ) {
                            throw new Error(
                              quantity === 0
                                ? "Số lượng phải lớn hơn 0"
                                : "Số lượng không được âm",
                            );
                          }

                          const batchId =
                            itemForm.getFieldValue(
                              "batch_id",
                            );

                          const inventoryItem =
                            availableBatches.find(
                              (item) =>
                                getBatchId(
                                  item,
                                ) ===
                                batchId,
                            );

                          if (inventoryItem) {
                            const maxQuantity =
                              getMaxQuantityForBatch(batchId);

                            if (quantity > maxQuantity) {
                              throw new Error(
                                `Vượt tồn khả dụng. Có thể dùng tối đa ${maxQuantity} ${getUnit(inventoryItem)}`,
                              );
                            }
                          }

                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <InputNumber<number>
                      style={{
                        width: "100%",
                      }}
                      placeholder="Nhập số lượng"
                      onChange={() => {
                        void itemForm.validateFields(
                          ["quantity"],
                        );
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Space>
                <Button
                  type={editingItemId ? "primary" : "dashed"}
                  htmlType="submit"
                  loading={addingItem}
                  icon={editingItemId ? <EditOutlined /> : <PlusOutlined />}
                >
                  {editingItemId ? "Lưu chỉnh sửa" : "Thêm thuốc vào phiếu"}
                </Button>

                {editingItemId && (
                  <Button onClick={cancelEditItem}>
                    Hủy sửa
                  </Button>
                )}
              </Space>
            </Form>
          )}

          <Table
            rowKey={(record) =>
              `${record.id ?? record.batch_id ?? record.lot_number}`
            }
            columns={itemColumns}
            dataSource={items}
            pagination={false}
            style={{
              marginTop: returnStatus === "DRAFT" ? 20 : 0,
            }}
          />
        </Card>
      )}

      {/* DRAFT -> SUBMIT */}

      {returnId && returnStatus === "DRAFT" && (
        <Card
          style={{
            marginBottom: 16,
          }}
        >
          <Button
            type="primary"
            icon={<SendOutlined />}
            disabled={items.length === 0}
            loading={submitting}
            onClick={() => void handleSubmit()}
          >
            Gửi duyệt
          </Button>
        </Card>
      )}

      {/* PENDING */}

      {returnId && returnStatus === "PENDING" && (
        <Card
          style={{
            marginBottom: 16,
          }}
        >
          <Space wrap>
            <Popconfirm
              title="Duyệt trả nhà cung cấp?"
              description="Sau khi duyệt, tồn kho của các lô trong phiếu sẽ bị trừ."
              okText="Duyệt"
              cancelText="Hủy"
              onConfirm={() => void handleApprove(returnId)}
            >
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={approving}
              >
                Duyệt
              </Button>
            </Popconfirm>

            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => setRejectModalOpen(true)}
            >
              Từ chối
            </Button>
          </Space>
        </Card>
      )}

      {returnId && returnStatus === "APPROVED" && (
        <Alert
          showIcon
          type="success"
          style={{
            marginBottom: 16,
          }}
          message="Phiếu trả đã được duyệt"
          description="Số lượng thuốc trong phiếu đã được trừ khỏi tồn kho."
        />
      )}

      {returnId && returnStatus === "REJECTED" && (
        <Alert
          showIcon
          type="error"
          style={{
            marginBottom: 16,
          }}
          message="Phiếu trả đã bị từ chối"
          description="Tồn kho không bị thay đổi."
        />
      )}

      {/* LIST */}

      <Card title="Danh sách phiếu trả NCC">
        <Table
          rowKey="id"
          columns={returnColumns}
          dataSource={returns}
          loading={loading}
          scroll={{
            x: 1000,
          }}
          pagination={{
            pageSize: 10,

            showTotal: (total) => `Tổng ${total} phiếu trả`,
          }}
        />
      </Card>

      {/* DETAIL */}

      <Drawer
        title={
          selectedReturn
            ? `Chi tiết ${selectedReturn.return_code || ""}`
            : "Chi tiết phiếu trả NCC"
        }
        width={760}
        open={drawerOpen}
        loading={detailLoading}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);

          setSelectedReturn(null);
        }}
      >
        {selectedReturn && (
          <>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Mã phiếu">
                {selectedReturn.return_code || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Nhà cung cấp">
                {selectedReturn.supplier?.name ||
                  selectedReturn.supplier_name ||
                  "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Kho trả">
                {selectedReturn.warehouse?.name ||
                  selectedReturn.warehouse_name ||
                  "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Lý do">
                {selectedReturn.reason || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ghi chú">
                {selectedReturn.note || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag color={getStatusColor(selectedReturn.status)}>
                  {getStatusLabel(selectedReturn.status)}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Ngày tạo">
                {formatDateTime(selectedReturn.created_at)}
              </Descriptions.Item>
            </Descriptions>

            <Title
              level={5}
              style={{
                marginTop: 24,
              }}
            >
              Thuốc trả NCC
            </Title>

            <Table
              rowKey={(record) =>
                `${record.id ?? record.batch_id ?? record.lot_number}`
              }
              columns={itemColumns}
              dataSource={selectedReturn.items || []}
              pagination={false}
            />
          </>
        )}
      </Drawer>

      {/* REJECT MODAL */}

      <Modal
        title="Từ chối và trả phiếu về Mới"
        open={rejectModalOpen}
        okText="Từ chối và cho chỉnh sửa"
        cancelText="Hủy"
        confirmLoading={rejecting}
        okButtonProps={{
          danger: true,
        }}
        onOk={() => void handleReject()}
        onCancel={() => {
          if (rejecting) {
            return;
          }

          setRejectModalOpen(false);

          setRejectReason("");
        }}
      >
        <Text>Nhập lý do từ chối:</Text>

        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          value={rejectReason}
          placeholder="Ví dụ: Số lượng thực tế không phù hợp với phiếu trả"
          style={{
            marginTop: 12,
          }}
          onChange={(event) => setRejectReason(event.target.value)}
        />
      </Modal>
    </div>
  );
}

export default SupplierReturns;