import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  StopOutlined,
} from "@ant-design/icons";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import type { TableColumnsType } from "antd";

import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

import api from "../api/api";

const { Text, Title } = Typography;

/* =========================================================
   TYPES
========================================================= */

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
  is_active?: boolean;
}

interface Warehouse {
  id: number;
  warehouse_code?: string;
  name: string;
  warehouse_type?: string;
  warehouse_type_name?: string | null;
  can_receive_purchase?: boolean;
  can_sell?: boolean;
  is_active?: boolean;
}

interface UserInfo {
  id?: number;
  full_name?: string;
  email?: string;
}

interface Medicine {
  id: number;
  medicine_code: string;
  name: string;
  active_ingredient?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  unit?: string | null;
  supplier_id?: number;
  supplier?: {
    id?: number;
    supplier_code?: string;
    name?: string;
  } | null;
  is_active?: boolean;
}

interface PurchaseReceiptItem {
  id?: number;
  receipt_id?: number;
  medicine_id?: number;
  lot_number: string;
  expiry_date: string;
  quantity: number | string;
  unit_price: number | string;
  line_total?: number | string;
  medicine?: Medicine | null;
  medicine_code?: string | null;
  medicine_name?: string | null;
  strength?: string | null;
  unit?: string | null;
}

interface PurchaseReceipt {
  id: number;
  receipt_code?: string | null;
  supplier_id?: number;
  warehouse_id?: number;
  supplier?: Supplier | null;
  warehouse?: Warehouse | null;
  invoice_number?: string | null;
  invoice_serial?: string | null;
  invoice_date?: string | null;
  note?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_by?: UserInfo | number | null;
  approved_by?: UserInfo | number | null;
  rejected_by?: UserInfo | number | null;
  items?: PurchaseReceiptItem[];
}

interface PurchaseReceiptBatchMap {
  item_id?: number;
  receipt_id: number;
  medicine_id?: number;
  lot_number?: string | null;
  expiry_date?: string | null;
  batch_id?: number | null;
  warehouse_id?: number | null;
  inventory_quantity?: number | string | null;
}

interface StockThresholdRow {
  medicine_id: number;
  medicine_code?: string;
  medicine_name?: string;
  unit?: string | null;

  warehouse_id: number;
  warehouse_code?: string;
  warehouse_name?: string;

  threshold_id?: number | null;
  minimum_stock?: number | string | null;
  reorder_quantity?: number | string | null;

  physical_stock?: number | string | null;
  usable_stock?: number | string | null;

  stock_status?: string;
  stock_status_label?: string;
}

interface HeaderFormValues {
  supplier_id: number;
  warehouse_id: number;
  invoice_number: string;
  invoice_serial?: string;
  invoice_date: Dayjs;
  note?: string;
}

interface ItemFormValues {
  medicine_id: number;
  lot_number: string;
  expiry_date: Dayjs;
  quantity: number;
  unit_price: number;
}

/* =========================================================
   NORMALIZE / HELPERS
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

function normalizeSuppliers(data: unknown): Supplier[] {
  return normalizeArray<Supplier>(data, ["data", "suppliers"]);
}

function normalizeMedicines(data: unknown): Medicine[] {
  return normalizeArray<Medicine>(data, ["data", "medicines"]);
}

function normalizeWarehouses(data: unknown): Warehouse[] {
  return normalizeArray<Warehouse>(data, ["data", "warehouses"]);
}

function normalizeReceipts(data: unknown): PurchaseReceipt[] {
  return normalizeArray<PurchaseReceipt>(data, [
    "data",
    "receipts",
    "purchase_receipts",
  ]);
}

function getReceiptFromResponse(data: unknown): {
  receipt: PurchaseReceipt | null;
  items: PurchaseReceiptItem[];
} {
  if (typeof data !== "object" || data === null) {
    return { receipt: null, items: [] };
  }

  const value = data as Record<string, unknown>;

  let receipt: PurchaseReceipt | null = null;

  if (
    value.receipt &&
    typeof value.receipt === "object" &&
    !Array.isArray(value.receipt)
  ) {
    receipt = value.receipt as PurchaseReceipt;
  } else if (
    value.purchase_receipt &&
    typeof value.purchase_receipt === "object" &&
    !Array.isArray(value.purchase_receipt)
  ) {
    receipt = value.purchase_receipt as PurchaseReceipt;
  } else if (
    value.data &&
    typeof value.data === "object" &&
    !Array.isArray(value.data)
  ) {
    receipt = value.data as PurchaseReceipt;
  }

  let items: PurchaseReceiptItem[] = [];

  if (Array.isArray(value.items)) {
    items = value.items as PurchaseReceiptItem[];
  } else if (receipt?.items && Array.isArray(receipt.items)) {
    items = receipt.items;
  }

  return { receipt, items };
}

function getMedicineSupplierId(medicine: Medicine) {
  return medicine.supplier?.id ?? medicine.supplier_id;
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "DRAFT":
      return "Mới";

    case "PENDING":
      return "Đang kiểm tra";

    case "RETURNED":
      return "Cần chỉnh sửa (dữ liệu cũ)";

    case "APPROVED":
      return "Đã nhập kho";

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

    default:
      return "default";
  }
}

function formatCurrency(value: number | string | undefined | null) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = dayjs(value);
  return date.isValid() ? date.format("DD/MM/YYYY") : value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = dayjs(value);
  return date.isValid() ? date.format("DD/MM/YYYY HH:mm") : value;
}

function getUserLabel(value?: UserInfo | number | null) {
  if (typeof value === "object" && value !== null) {
    return value.full_name || value.email || `Người dùng #${value.id ?? "?"}`;
  }

  if (typeof value === "number") {
    return `Người dùng #${value}`;
  }

  return "-";
}

function getSupplierName(receipt: PurchaseReceipt) {
  return receipt.supplier?.name || "-";
}

function getWarehouseName(receipt: PurchaseReceipt) {
  return receipt.warehouse?.name || "-";
}

function isEditableStatus(status?: string | null) {
  return status === "DRAFT" || status === "RETURNED";
}

/* =========================================================
   COMPONENT
========================================================= */

function PurchaseReceipts() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionReady, setPermissionReady] = useState(false);

  const canView = permissions.includes("PURCHASE_VIEW");
  const canCreate = permissions.includes("PURCHASE_CREATE");

  const [searchParams, setSearchParams] = useSearchParams();

  const restockMedicineId = Number(
    searchParams.get("restock_medicine_id") || 0,
  );
  const restockWarehouseId = Number(
    searchParams.get("restock_warehouse_id") || 0,
  );
  const restockSuggestedQty = Number(
    searchParams.get("suggested_qty") || 0,
  );

  const [headerForm] = Form.useForm<HeaderFormValues>();
  const [itemForm] = Form.useForm<ItemFormValues>();

  const watchedSupplierId = Form.useWatch("supplier_id", headerForm);
  const watchedWarehouseId = Form.useWatch("warehouse_id", headerForm);
  const watchedMedicineId = Form.useWatch("medicine_id", itemForm);

  /* =========================
     MASTER DATA
  ========================= */

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [
    restockSourceWarehouse,
    setRestockSourceWarehouse,
  ] = useState<Warehouse | null>(null);

  const [stockThresholds, setStockThresholds] = useState<StockThresholdRow[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);

  const [thresholdModalOpen, setThresholdModalOpen] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdMinimumStock, setThresholdMinimumStock] =
    useState<number | null>(null);
  const [thresholdReorderQuantity, setThresholdReorderQuantity] =
    useState<number | null>(null);

  /* =========================
     CURRENT RECEIPT
  ========================= */

  const [currentReceipt, setCurrentReceipt] =
    useState<PurchaseReceipt | null>(null);
  const [items, setItems] = useState<PurchaseReceiptItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  /* =========================
     HISTORY
  ========================= */

  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<string | undefined>();
  const [historySupplier, setHistorySupplier] = useState<number | undefined>();

  const [receiptBatchMap, setReceiptBatchMap] = useState<
    Record<number, PurchaseReceiptBatchMap[]>
  >({});

  const [receiptBatchLoading, setReceiptBatchLoading] =
    useState<Record<number, boolean>>({});

  /* =========================
     DETAIL DRAWER
  ========================= */

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] =
    useState<PurchaseReceipt | null>(null);
  const [selectedReceiptItems, setSelectedReceiptItems] = useState<
    PurchaseReceiptItem[]
  >([]);

  /* =========================
     REJECT TO EDIT MODAL
  ========================= */

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  /* =========================
     LOADING
  ========================= */

  const [creating, setCreating] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [currentLoading, setCurrentLoading] = useState(false);

  /* =========================================================
     DERIVED
  ========================================================= */

  const currentStatus = currentReceipt?.status || "";
  const editable = canCreate && isEditableStatus(currentStatus);

  const availableMedicines = useMemo(() => {
    if (!watchedSupplierId) return [];

    return medicines.filter(
      (medicine) =>
        medicine.is_active !== false &&
        getMedicineSupplierId(medicine) === watchedSupplierId,
    );
  }, [medicines, watchedSupplierId]);

  const selectedMedicine = useMemo(
    () => medicines.find((medicine) => medicine.id === watchedMedicineId),
    [medicines, watchedMedicineId],
  );

  const selectedThreshold = useMemo(() => {
    if (!watchedMedicineId || !watchedWarehouseId) {
      return undefined;
    }

    return stockThresholds.find(
      (item) =>
        item.medicine_id === watchedMedicineId &&
        item.warehouse_id === watchedWarehouseId,
    );
  }, [stockThresholds, watchedMedicineId, watchedWarehouseId]);

  const totalAmount = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + Number(item.quantity || 0) * Number(item.unit_price || 0),
        0,
      ),
    [items],
  );

  const currentStep = useMemo(() => {
    if (!currentReceipt) return 0;
    if (currentStatus === "APPROVED") return 2;
    return 1;
  }, [currentReceipt, currentStatus]);

  /* =========================================================
     PERMISSIONS
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadPermissions = async () => {
      try {
        const response = await api.get("/users/me");

        if (cancelled) {
          return;
        }

        const codes =
          Array.isArray(response.data?.permissions)
            ? (response.data.permissions as unknown[]).filter(
                (value): value is string =>
                  typeof value === "string",
              )
            : [];

        setPermissions(codes);
      } catch (error) {
        console.error("Load purchase permissions:", error);
        setPermissions([]);
      } finally {
        if (!cancelled) {
          setPermissionReady(true);
        }
      }
    };

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const [supplierResponse, medicineResponse, warehouseResponse, receiptResponse] =
          await Promise.all([
            api.get("/suppliers", { params: { is_active: true } }),
            api.get("/medicines", { params: { is_active: true } }),
            api.get("/warehouses", { params: { is_active: true } }),
            api.get("/purchase-receipts"),
          ]);

        if (cancelled) return;

        if (supplierResponse.data.success === true) {
          setSuppliers(normalizeSuppliers(supplierResponse.data));
        }

        if (medicineResponse.data.success === true) {
          setMedicines(normalizeMedicines(medicineResponse.data));
        }

        const loadedWarehouses =
          warehouseResponse.data.success === true
            ? normalizeWarehouses(
                warehouseResponse.data,
              )
            : [];

        const purchaseWarehouses =
          loadedWarehouses.filter(
            (warehouse) =>
              warehouse.is_active !== false &&
              (
                warehouse.can_receive_purchase === true ||
                warehouse.warehouse_type === "MAIN"
              ),
          );

        setWarehouses(
          purchaseWarehouses,
        );

        if (receiptResponse.data.success === true) {
          const loadedReceipts =
            normalizeReceipts(receiptResponse.data);

          setReceipts(loadedReceipts);

          await loadBatchMappingsForReceipts(
            loadedReceipts,
          );
        }

        if (restockMedicineId > 0 && restockWarehouseId > 0) {
          const loadedMedicines = normalizeMedicines(medicineResponse.data);

          const restockMedicine = loadedMedicines.find(
            (medicine) => medicine.id === restockMedicineId,
          );

          const supplierId = restockMedicine
            ? getMedicineSupplierId(restockMedicine)
            : undefined;

          const sourceWarehouse =
            loadedWarehouses.find(
              (warehouse) =>
                warehouse.id ===
                restockWarehouseId,
            ) || null;

          setRestockSourceWarehouse(
            sourceWarehouse,
          );

          const purchaseWarehouseId =
            sourceWarehouse &&
            (
              sourceWarehouse.can_receive_purchase === true ||
              sourceWarehouse.warehouse_type === "MAIN"
            )
              ? sourceWarehouse.id
              : purchaseWarehouses[0]?.id;

          if (!purchaseWarehouseId) {
            message.error(
              "Không có Kho chính đang hoạt động để nhận hàng từ nhà cung cấp",
            );
          } else if (supplierId) {
            headerForm.setFieldsValue({
              supplier_id: supplierId,
              warehouse_id: purchaseWarehouseId,
            });
          } else {
            headerForm.setFieldValue(
              "warehouse_id",
              purchaseWarehouseId,
            );
          }

          itemForm.setFieldsValue({
            medicine_id: restockMedicineId,
            quantity:
              restockSuggestedQty > 0
                ? Math.trunc(restockSuggestedQty)
                : undefined,
          });
        }

        try {
          const thresholdResponse = await api.get("/stock-thresholds");

          if (!cancelled && thresholdResponse.data?.success === true) {
            setStockThresholds(thresholdResponse.data.data || []);
          }
        } catch (thresholdError) {
          console.error("Load stock thresholds:", thresholdError);
        }
      } catch (error) {
        console.error("Load purchase receipts:", error);

        if (!cancelled) {
          message.error("Không thể tải dữ liệu nhập thuốc");
        }
      } finally {
        if (!cancelled) {
          setLoadingMaster(false);
          setHistoryLoading(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     STOCK THRESHOLD
  ========================================================= */

  const getStockNumber = (
    value: number | string | null | undefined,
  ) => {
    const parsed = Number(value ?? 0);

    return Number.isFinite(parsed) ? parsed : 0;
  };

  const loadStockThresholds = async () => {
    try {
      const response = await api.get("/stock-thresholds");

      if (response.data?.success === true) {
        setStockThresholds(response.data.data || []);
      }
    } catch (error) {
      console.error("Load stock thresholds:", error);
      message.error("Không thể tải cấu hình ngưỡng tồn");
    }
  };

  const openThresholdModal = () => {
    if (!canCreate) {
      message.warning("Tài khoản chỉ có quyền xem, không được chỉnh ngưỡng tồn");
      return;
    }

    if (!watchedWarehouseId) {
      message.warning("Vui lòng chọn kho nhập trước");
      return;
    }

    if (!watchedMedicineId) {
      message.warning("Vui lòng chọn thuốc trước");
      return;
    }

    if (selectedThreshold?.threshold_id != null) {
      setThresholdMinimumStock(
        getStockNumber(selectedThreshold.minimum_stock),
      );

      setThresholdReorderQuantity(
        getStockNumber(selectedThreshold.reorder_quantity),
      );
    } else {
      setThresholdMinimumStock(null);
      setThresholdReorderQuantity(null);
    }

    setThresholdModalOpen(true);
  };

  const handleSaveThreshold = async () => {
    if (!canCreate) {
      message.warning("Tài khoản chỉ có quyền xem, không được chỉnh ngưỡng tồn");
      return;
    }

    if (!watchedWarehouseId || !watchedMedicineId) {
      message.warning("Vui lòng chọn kho và thuốc");
      return;
    }

    if (
      thresholdMinimumStock === null ||
      thresholdMinimumStock <= 0 ||
      !Number.isInteger(thresholdMinimumStock)
    ) {
      message.warning(
        "Ngưỡng tồn tối thiểu phải là số nguyên lớn hơn 0",
      );
      return;
    }

    if (
      thresholdReorderQuantity === null ||
      thresholdReorderQuantity <= 0 ||
      !Number.isInteger(thresholdReorderQuantity)
    ) {
      message.warning(
        "Số lượng đề nghị nhập phải là số nguyên lớn hơn 0",
      );
      return;
    }

    try {
      setThresholdSaving(true);

      const response = await api.put(
        `/stock-thresholds/${watchedMedicineId}/${watchedWarehouseId}`,
        {
          minimum_stock: thresholdMinimumStock,
          reorder_quantity: thresholdReorderQuantity,
        },
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message || "Không thể lưu ngưỡng tồn",
        );
        return;
      }

      await loadStockThresholds();

      setThresholdModalOpen(false);

      message.success("Đã lưu ngưỡng tồn cho thuốc tại kho này");
    } catch (error) {
      console.error("Save stock threshold:", error);
      message.error("Không thể lưu ngưỡng tồn");
    } finally {
      setThresholdSaving(false);
    }
  };

  /* =========================================================
     HISTORY
  ========================================================= */

  const buildHistoryParams = () => {
    const params: {
      search?: string;
      status?: string;
      supplier_id?: number;
    } = {};

    const keyword = historySearch.trim();

    if (keyword) params.search = keyword;
    if (historyStatus) params.status = historyStatus;
    if (historySupplier !== undefined) params.supplier_id = historySupplier;

    return params;
  };

  async function loadBatchMappingsForReceipts(
    receiptList: PurchaseReceipt[],
  ) {
    const approvedReceipts = receiptList.filter(
      (receipt) => receipt.status === "APPROVED",
    );

    if (approvedReceipts.length === 0) {
      setReceiptBatchMap({});
      setReceiptBatchLoading({});
      return;
    }

    setReceiptBatchLoading(
      Object.fromEntries(
        approvedReceipts.map((receipt) => [
          receipt.id,
          true,
        ]),
      ) as Record<number, boolean>,
    );

    const results = await Promise.all(
      approvedReceipts.map(async (receipt) => {
        try {
          const response = await api.get(
            `/purchase-receipts/${receipt.id}/batches`,
          );

          const payload = response.data;

          let rows: PurchaseReceiptBatchMap[] = [];

          if (
            payload?.success === true &&
            Array.isArray(payload?.data)
          ) {
            rows =
              payload.data as PurchaseReceiptBatchMap[];
          } else if (Array.isArray(payload)) {
            rows =
              payload as PurchaseReceiptBatchMap[];
          }

          return [receipt.id, rows] as const;
        } catch (error) {
          console.error(
            `Load batch mapping for purchase receipt ${receipt.id}:`,
            error,
          );

          return [
            receipt.id,
            [] as PurchaseReceiptBatchMap[],
          ] as const;
        }
      }),
    );

    setReceiptBatchMap(
      Object.fromEntries(results) as Record<
        number,
        PurchaseReceiptBatchMap[]
      >,
    );

    setReceiptBatchLoading({});
  }

  const loadReceiptHistory = async (showSuccess = false) => {
    try {
      setHistoryLoading(true);

      const response = await api.get("/purchase-receipts", {
        params: buildHistoryParams(),
      });

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể tải danh sách phiếu nhập");
        return;
      }

      const loadedReceipts =
        normalizeReceipts(response.data);

      setReceipts(loadedReceipts);

      await loadBatchMappingsForReceipts(
        loadedReceipts,
      );

      if (showSuccess) {
        message.success("Đã cập nhật danh sách phiếu nhập");
      }
    } catch (error) {
      console.error("Load receipt history:", error);
      message.error("Không thể tải danh sách phiếu nhập");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleResetHistory = () => {
    setHistorySearch("");
    setHistoryStatus(undefined);
    setHistorySupplier(undefined);

    void (async () => {
      try {
        setHistoryLoading(true);
        const response = await api.get("/purchase-receipts");
        if (response.data.success === true) {
          const loadedReceipts =
            normalizeReceipts(response.data);

          setReceipts(loadedReceipts);

          await loadBatchMappingsForReceipts(
            loadedReceipts,
          );
        }
      } finally {
        setHistoryLoading(false);
      }
    })();
  };

  /* =========================================================
     LOAD CURRENT RECEIPT
  ========================================================= */

  const reloadReceipt = async (id: number): Promise<PurchaseReceipt | null> => {
    try {
      setCurrentLoading(true);

      const response = await api.get(`/purchase-receipts/${id}`);

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể tải chi tiết phiếu nhập");
        return null;
      }

      const { receipt, items: detailItems } = getReceiptFromResponse(response.data);

      if (!receipt) {
        message.error("Không tìm thấy phiếu nhập");
        return null;
      }

      setCurrentReceipt(receipt);
      setItems(detailItems);
      setEditingItemId(null);
      itemForm.resetFields();

      headerForm.setFieldsValue({
        supplier_id: receipt.supplier?.id ?? receipt.supplier_id ?? 0,
        warehouse_id: receipt.warehouse?.id ?? receipt.warehouse_id ?? 0,
        invoice_number: receipt.invoice_number || "",
        invoice_serial: receipt.invoice_serial || "",
        invoice_date: receipt.invoice_date ? dayjs(receipt.invoice_date) : dayjs(),
        note: receipt.note || "",
      });

      return receipt;
    } catch (error) {
      console.error("Reload receipt:", error);
      message.error("Không thể tải chi tiết phiếu nhập");
      return null;
    } finally {
      setCurrentLoading(false);
    }
  };

  const handleOpenReceipt = async (id: number) => {
    const receipt = await reloadReceipt(id);

    if (receipt) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  /* =========================================================
     CREATE / SAVE HEADER
  ========================================================= */

  const validateHeader = (values: HeaderFormValues) => {
    if (!values.invoice_date) {
      message.warning("Vui lòng chọn ngày hóa đơn");
      return false;
    }

    if (values.invoice_date.isAfter(dayjs().endOf("day"))) {
      message.warning("Ngày hóa đơn không được lớn hơn ngày hiện tại");
      return false;
    }

    return true;
  };

  const headerPayload = (values: HeaderFormValues) => ({
    supplier_id: values.supplier_id,
    warehouse_id: values.warehouse_id,
    invoice_number: values.invoice_number.trim(),
    invoice_serial: values.invoice_serial?.trim() || null,
    invoice_date: values.invoice_date.format("YYYY-MM-DD"),
    note: values.note?.trim() || null,
  });

  const handleCreateReceipt = async (values: HeaderFormValues) => {
    if (!validateHeader(values)) return;

    try {
      setCreating(true);

      const response = await api.post("/purchase-receipts", headerPayload(values));

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể tạo phiếu nhập");
        return;
      }

      const newId = Number(response.data.receipt_id ?? response.data.id);

      if (!Number.isFinite(newId) || newId <= 0) {
        message.error("Không nhận được ID phiếu nhập hợp lệ");
        return;
      }

      await reloadReceipt(newId);

      if (restockMedicineId > 0) {
        itemForm.setFieldsValue({
          medicine_id: restockMedicineId,
          quantity:
            restockSuggestedQty > 0
              ? Math.trunc(restockSuggestedQty)
              : undefined,
        });
      }

      await loadReceiptHistory();
      message.success("Tạo phiếu nhập thành công");
    } catch (error) {
      console.error("Create receipt:", error);
      message.error("Có lỗi khi tạo phiếu nhập");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveHeader = async (values: HeaderFormValues) => {
    if (!currentReceipt) return;
    if (!editable) {
      message.warning("Phiếu hiện tại không được phép chỉnh sửa");
      return;
    }
    if (!validateHeader(values)) return;

    try {
      setSavingHeader(true);

      const response = await api.put(
        `/purchase-receipts/${currentReceipt.id}`,
        headerPayload(values),
      );

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể cập nhật phiếu nhập");
        return;
      }

      await reloadReceipt(currentReceipt.id);
      await loadReceiptHistory();
      message.success("Đã lưu thông tin phiếu");
    } catch (error) {
      console.error("Save receipt header:", error);
      message.error("Có lỗi khi cập nhật phiếu nhập");
    } finally {
      setSavingHeader(false);
    }
  };

  /* =========================================================
     ITEM ADD / UPDATE / DELETE
  ========================================================= */

  const validateItem = (values: ItemFormValues) => {
    if (!currentReceipt || !editable) {
      message.warning("Phiếu hiện tại không được phép chỉnh sửa");
      return false;
    }

    const medicine = availableMedicines.find(
      (item) => item.id === values.medicine_id,
    );

    if (!medicine) {
      message.warning("Thuốc không thuộc nhà cung cấp của phiếu nhập");
      return false;
    }

    if (!values.expiry_date || !values.expiry_date.isAfter(dayjs().endOf("day"))) {
      message.warning("Hạn sử dụng phải lớn hơn ngày hiện tại");
      return false;
    }

    const quantity = Number(values.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      message.warning("Số lượng phải lớn hơn 0");
      return false;
    }

    if (!Number.isInteger(quantity)) {
      message.warning("Số lượng phải là số nguyên");
      return false;
    }

    const unitPrice = Number(values.unit_price);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      message.warning("Đơn giá phải lớn hơn 0");
      return false;
    }

    if (!Number.isInteger(unitPrice)) {
      message.warning("Đơn giá phải là số nguyên");
      return false;
    }

    return true;
  };

  const buildItemPayload = (values: ItemFormValues) => ({
    medicine_id: values.medicine_id,
    lot_number: values.lot_number.trim(),
    expiry_date: values.expiry_date.format("YYYY-MM-DD"),
    quantity: Number(values.quantity),
    unit_price: Number(values.unit_price),
  });

  const handleSaveItem = async (values: ItemFormValues) => {
    if (!currentReceipt || !validateItem(values)) return;

    try {
      setSavingItem(true);

      const payload = buildItemPayload(values);

      const response = editingItemId
        ? await api.put(
            `/purchase-receipts/${currentReceipt.id}/items/${editingItemId}`,
            payload,
          )
        : await api.post(`/purchase-receipts/${currentReceipt.id}/items`, payload);

      if (response.data.success !== true) {
        message.error(
          response.data.message ||
            (editingItemId ? "Không thể cập nhật thuốc" : "Không thể thêm thuốc"),
        );
        return;
      }

      itemForm.resetFields();
      setEditingItemId(null);
      await reloadReceipt(currentReceipt.id);
      await loadReceiptHistory();

      if (restockMedicineId > 0) {
        setSearchParams(new URLSearchParams(), { replace: true });
      }

      message.success(editingItemId ? "Đã cập nhật thuốc" : "Đã thêm thuốc vào phiếu");
    } catch (error) {
      console.error("Save receipt item:", error);
      message.error("Có lỗi khi lưu thuốc trong phiếu");
    } finally {
      setSavingItem(false);
    }
  };

  const handleEditItem = (item: PurchaseReceiptItem) => {
    if (!item.id || !editable) return;

    setEditingItemId(item.id);

    itemForm.setFieldsValue({
      medicine_id: item.medicine?.id ?? item.medicine_id ?? 0,
      lot_number: item.lot_number,
      expiry_date: dayjs(item.expiry_date),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    });
  };

  const handleCancelEditItem = () => {
    setEditingItemId(null);
    itemForm.resetFields();
  };

  const handleDeleteItem = async (itemId?: number) => {
    if (!currentReceipt || !itemId || !editable) return;

    try {
      setDeletingItemId(itemId);

      const response = await api.delete(
        `/purchase-receipts/${currentReceipt.id}/items/${itemId}`,
      );

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể xóa thuốc");
        return;
      }

      if (editingItemId === itemId) {
        handleCancelEditItem();
      }

      await reloadReceipt(currentReceipt.id);
      await loadReceiptHistory();
      message.success("Đã xóa thuốc khỏi phiếu");
    } catch (error) {
      console.error("Delete receipt item:", error);
      message.error("Có lỗi khi xóa thuốc");
    } finally {
      setDeletingItemId(null);
    }
  };

  /* =========================================================
     WORKFLOW
  ========================================================= */

  const handleReviewReceipt = async () => {
    if (!currentReceipt) return;

    if (
      currentStatus !== "DRAFT" &&
      currentStatus !== "RETURNED"
    ) {
      message.warning(
        "Chỉ phiếu Mới/Cần chỉnh sửa mới được chuyển sang bước kiểm tra",
      );
      return;
    }

    if (items.length === 0) {
      message.warning("Phiếu nhập chưa có thuốc");
      return;
    }

    try {
      setReviewing(true);

      const response = await api.post(
        `/purchase-receipts/${currentReceipt.id}/review`,
      );

      if (response.data.success !== true) {
        message.error(
          response.data.message || "Không thể chuyển sang bước kiểm tra",
        );
        return;
      }

      await reloadReceipt(currentReceipt.id);
      await loadReceiptHistory();

      message.success(
        "Phiếu đã chuyển sang bước kiểm tra",
      );
    } catch (error) {
      console.error("Review purchase receipt:", error);
      message.error("Có lỗi khi chuyển sang bước kiểm tra");
    } finally {
      setReviewing(false);
    }
  };

  const handleCompleteReceipt = async () => {
    if (!currentReceipt) return;

    if (currentStatus !== "PENDING") {
      message.warning(
        "Hãy chuyển phiếu sang bước Kiểm tra trước khi nhập kho",
      );
      return;
    }

    try {
      setCompleting(true);

      const response = await api.post(
        `/purchase-receipts/${currentReceipt.id}/complete`,
      );

      if (response.data.success !== true) {
        message.error(
          response.data.message || "Không thể nhập kho",
        );
        return;
      }

      await reloadReceipt(currentReceipt.id);
      await loadReceiptHistory();

      message.success(
        "Nhập kho thành công, tồn kho đã được cập nhật",
      );
    } catch (error) {
      console.error("Complete purchase receipt:", error);
      message.error("Có lỗi khi nhập kho");
    } finally {
      setCompleting(false);
    }
  };

  const openRejectModal = () => {
    if (!currentReceipt || currentStatus !== "PENDING") {
      return;
    }

    setRejectReason("");
    setRejectModalOpen(true);
  };

  const handleRejectToDraft = async () => {
    if (!currentReceipt) return;

    const reason = rejectReason.trim();

    if (!reason) {
      message.warning("Vui lòng nhập lý do từ chối");
      return;
    }

    try {
      setRejecting(true);

      const response = await api.post(
        `/purchase-receipts/${currentReceipt.id}/reject`,
        {
          reason,
        },
      );

      if (response.data.success !== true) {
        message.error(
          response.data.message ||
            "Không thể trả phiếu về trạng thái Mới",
        );
        return;
      }

      setRejectModalOpen(false);
      setRejectReason("");

      await reloadReceipt(currentReceipt.id);
      await loadReceiptHistory();

      message.success(
        "Phiếu đã trở về trạng thái Mới để chỉnh sửa",
      );
    } catch (error) {
      console.error("Reject purchase receipt:", error);
      message.error("Có lỗi khi từ chối phiếu");
    } finally {
      setRejecting(false);
    }
  };


  /* =========================================================
     NEW RECEIPT
  ========================================================= */

  const handleNewReceipt = () => {
    setCurrentReceipt(null);
    setItems([]);
    setEditingItemId(null);

    headerForm.resetFields();
    headerForm.setFieldsValue({ invoice_date: dayjs() });
    itemForm.resetFields();

    if (restockMedicineId > 0 && restockWarehouseId > 0) {
      const restockMedicine = medicines.find(
        (medicine) => medicine.id === restockMedicineId,
      );

      const supplierId = restockMedicine
        ? getMedicineSupplierId(restockMedicine)
        : undefined;

      const purchaseWarehouseId =
        warehouses.find(
          (warehouse) =>
            warehouse.id === restockWarehouseId,
        )?.id ||
        warehouses[0]?.id;

      headerForm.setFieldsValue({
        supplier_id: supplierId,
        warehouse_id: purchaseWarehouseId,
        invoice_date: dayjs(),
      });

      itemForm.setFieldsValue({
        medicine_id: restockMedicineId,
        quantity:
          restockSuggestedQty > 0
            ? Math.trunc(restockSuggestedQty)
            : undefined,
      });
    }

    setThresholdModalOpen(false);
    setThresholdMinimumStock(null);
    setThresholdReorderQuantity(null);
  };

  /* =========================================================
     ITEM TABLE
  ========================================================= */

  const itemColumns: TableColumnsType<PurchaseReceiptItem> = [
    {
      title: "STT",
      key: "stt",
      width: 60,
      align: "center",
      render: (_value, _record, index) => index + 1,
    },
    {
      title: "ID thuốc",
      key: "medicine_id",
      width: 90,
      align: "center",
      render: (_value, record) =>
        record.medicine?.id ??
        record.medicine_id ??
        "-",
    },

    {
      title: "Mã thuốc",
      key: "medicine_code",
      width: 120,
      render: (_value, record) => (
        <Text strong>
          {record.medicine?.medicine_code || record.medicine_code || "-"}
        </Text>
      ),
    },
    {
      title: "Tên thuốc",
      key: "medicine_name",
      width: 220,
      render: (_value, record) => (
        <div>
          <Text>{record.medicine?.name || record.medicine_name || "-"}</Text>
          {(record.medicine?.strength || record.strength) && (
            <>
              <br />
              <Text type="secondary">
                {record.medicine?.strength || record.strength}
              </Text>
            </>
          )}
        </div>
      ),
    },
    {
      title: "Lô",
      dataIndex: "lot_number",
      key: "lot_number",
      width: 130,
    },
    {
      title: "HSD",
      dataIndex: "expiry_date",
      key: "expiry_date",
      width: 120,
      render: (value: string) => formatDate(value),
    },
    {
      title: "Số lượng",
      key: "quantity",
      width: 130,
      align: "right",
      render: (_value, record) =>
        `${Number(record.quantity || 0)} ${record.medicine?.unit || record.unit || ""}`,
    },
    {
      title: "Đơn giá",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 130,
      align: "right",
      render: (value) => `${formatCurrency(value)} đ`,
    },
    {
      title: "Thành tiền",
      key: "line_total",
      width: 150,
      align: "right",
      render: (_value, record) =>
        `${formatCurrency(
          Number(record.quantity || 0) * Number(record.unit_price || 0),
        )} đ`,
    },
    ...(editable
      ? [
          {
            title: "Thao tác",
            key: "actions",
            width: 150,
            fixed: "right" as const,
            render: (_value: unknown, record: PurchaseReceiptItem) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEditItem(record)}
                >
                  Sửa
                </Button>

                <Popconfirm
                  title="Xóa thuốc khỏi phiếu?"
                  description="Bạn có chắc muốn xóa dòng thuốc này?"
                  okText="Xóa"
                  cancelText="Hủy"
                  onConfirm={() => void handleDeleteItem(record.id)}
                >
                  <Button
                    type="link"
                    danger
                    size="small"
                    loading={deletingItemId === record.id}
                    icon={<DeleteOutlined />}
                  >
                    Xóa
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  /* =========================================================
     HISTORY TABLE
  ========================================================= */

  const receiptColumns: TableColumnsType<PurchaseReceipt> = [
    {
      title: "Mã phiếu",
      dataIndex: "receipt_code",
      key: "receipt_code",
      width: 120,
      render: (value: string | null, record) => (
        <Text strong>{value || `PN${String(record.id).padStart(6, "0")}`}</Text>
      ),
    },
    {
      title: "ID lô",
      key: "batch_ids",
      width: 150,
      align: "center",
      render: (_value, record) => {
        if (record.status !== "APPROVED") {
          return <Text type="secondary">-</Text>;
        }

        if (receiptBatchLoading[record.id]) {
          return <Text type="secondary">Đang tải...</Text>;
        }

        const batchRows =
          receiptBatchMap[record.id] || [];

        const batchIds = Array.from(
          new Set(
            batchRows
              .map((item) => Number(item.batch_id))
              .filter(
                (batchId) =>
                  Number.isFinite(batchId) &&
                  batchId > 0,
              ),
          ),
        );

        if (batchIds.length === 0) {
          return (
            <Text type="secondary">
              -
            </Text>
          );
        }

        return (
          <Space size={[4, 4]} wrap>
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
      title: "Nhà cung cấp",
      key: "supplier",
      width: 220,
      render: (_value, record) => getSupplierName(record),
    },
    {
      title: "Kho nhập",
      key: "warehouse",
      width: 160,
      render: (_value, record) => getWarehouseName(record),
    },
    {
      title: "Số hóa đơn",
      dataIndex: "invoice_number",
      key: "invoice_number",
      width: 140,
      render: (value: string | null) => value || "-",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 135,
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
      width: 190,
      fixed: "right",
      render: (_value, record) => (
        <Space size={4}>
          {canCreate && (
            <Button
              type="link"
              icon={<FileAddOutlined />}
              onClick={() => void handleOpenReceipt(record.id)}
            >
              Mở phiếu
            </Button>
          )}

          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => void handleViewReceiptDetail(record.id)}
          >
            Xem
          </Button>
        </Space>
      ),
    },
  ];

  /* =========================================================
     HISTORY DETAIL
  ========================================================= */

  const handleViewReceiptDetail = async (id: number) => {
    try {
      setDrawerOpen(true);
      setDrawerLoading(true);
      setSelectedReceipt(null);
      setSelectedReceiptItems([]);

      const response = await api.get(`/purchase-receipts/${id}`);

      if (response.data.success !== true) {
        message.error(response.data.message || "Không thể tải chi tiết phiếu");
        setDrawerOpen(false);
        return;
      }

      const { receipt, items: detailItems } = getReceiptFromResponse(response.data);

      if (!receipt) {
        message.error("Không tìm thấy phiếu nhập");
        setDrawerOpen(false);
        return;
      }

      setSelectedReceipt(receipt);
      setSelectedReceiptItems(detailItems);
    } catch (error) {
      console.error("View receipt:", error);
      message.error("Không thể tải chi tiết phiếu");
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const detailTotal = selectedReceiptItems.reduce(
    (total, item) =>
      total + Number(item.quantity || 0) * Number(item.unit_price || 0),
    0,
  );

  /* =========================================================
     RENDER
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
        message="Bạn không có quyền xem Nhập thuốc"
        description="Tài khoản cần quyền PURCHASE_VIEW để truy cập chức năng này."
      />
    );
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>
            Nhập thuốc
          </Title>
          <Text type="secondary">
            Tạo phiếu, thêm nhiều thuốc, gửi duyệt và duyệt ngay trên cùng một trang.
          </Text>
        </div>

        {canCreate && (
          <Button
            icon={<FileAddOutlined />}
            onClick={handleNewReceipt}
          >
            Phiếu mới
          </Button>
        )}
      </div>

      {canCreate && restockMedicineId > 0 && restockWarehouseId > 0 && (
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 16 }}
          message="Đã điền sẵn thông tin nhập thêm hàng từ trang Tồn kho"
          description={
            <Space wrap>
              <Text>
                Thuốc:{" "}
                <Text strong>
                  {medicines.find(
                    (medicine) => medicine.id === restockMedicineId,
                  )?.name || `ID ${restockMedicineId}`}
                </Text>
              </Text>

              <Text>
                Nhu cầu tại:{" "}
                <Text strong>
                  {restockSourceWarehouse?.name ||
                    `Kho ID ${restockWarehouseId}`}
                </Text>
              </Text>

              <Text>
                Nhập từ NCC vào:{" "}
                <Text strong>
                  {warehouses.find(
                    (warehouse) =>
                      warehouse.id ===
                      watchedWarehouseId,
                  )?.name ||
                    warehouses[0]?.name ||
                    "Kho chính"}
                </Text>
              </Text>

              {restockSourceWarehouse &&
                restockSourceWarehouse.warehouse_type !== "MAIN" && (
                <Text type="secondary">
                  Sau khi nhập Kho chính, dùng Chuyển kho để bổ sung cho{" "}
                  {restockSourceWarehouse.name}.
                </Text>
              )}

              {restockSuggestedQty > 0 && (
                <Text>
                  Đề nghị nhập:{" "}
                  <Text strong>
                    {Math.trunc(restockSuggestedQty)}{" "}
                    {medicines.find(
                      (medicine) => medicine.id === restockMedicineId,
                    )?.unit || "đơn vị"}
                  </Text>
                </Text>
              )}
            </Space>
          }
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={currentStep}
          items={[
            { title: "Tạo phiếu" },
            { title: "Kiểm tra / chỉnh thuốc" },
            { title: "Đã nhập kho" },
          ]}
        />
      </Card>

      {/* =====================================================
          1. HEADER
      ===================================================== */}
      <Card
        title={currentReceipt ? `1. Phiếu ${currentReceipt.receipt_code || ""}` : "1. Tạo phiếu nhập"}
        loading={loadingMaster || currentLoading}
        style={{ marginBottom: 16 }}
        extra={
          currentReceipt ? (
            <Tag color={getStatusColor(currentStatus)}>
              {getStatusLabel(currentStatus)}
            </Tag>
          ) : null
        }
      >

        <Form<HeaderFormValues>
          form={headerForm}
          layout="vertical"
          initialValues={{ invoice_date: dayjs() }}
          onFinish={currentReceipt ? handleSaveHeader : handleCreateReceipt}
          disabled={
            !canCreate ||
            (Boolean(currentReceipt) && !editable)
          }
        >
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item
                label="Nhà cung cấp"
                name="supplier_id"
                rules={[{ required: true, message: "Chọn nhà cung cấp" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn nhà cung cấp"
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: `${supplier.supplier_code} - ${supplier.name}`,
                  }))}
                  onChange={() => {
                    itemForm.setFieldValue("medicine_id", undefined);
                  }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item
                label="Kho nhập"
                name="warehouse_id"
                extra="Nhập thuốc từ nhà cung cấp chỉ được thực hiện vào Kho chính."
                rules={[{ required: true, message: "Chọn Kho chính" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn Kho chính"
                  options={warehouses.map((warehouse) => ({
                    value: warehouse.id,
                    label: `${warehouse.warehouse_code || "KHO"} - ${warehouse.name} (${warehouse.warehouse_type_name || "Kho chính"})`,
                  }))}
                  onChange={() => {
                    itemForm.setFieldValue("medicine_id", undefined);
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item
                label="Số hóa đơn"
                name="invoice_number"
                rules={[{ required: true, message: "Nhập số hóa đơn" }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item label="Seri hóa đơn" name="invoice_serial">
                <Input maxLength={100} />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item
                label="Ngày hóa đơn"
                name="invoice_date"
                rules={[{ required: true, message: "Chọn ngày hóa đơn" }]}
              >
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  disabledDate={(current) =>
                    Boolean(current && current > dayjs().endOf("day"))
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>

          {!currentReceipt ? (
            <Button
              type="primary"
              htmlType="submit"
              loading={creating}
              icon={<PlusOutlined />}
            >
              Tạo phiếu
            </Button>
          ) : editable ? (
            <Button
              type="primary"
              htmlType="submit"
              loading={savingHeader}
              icon={<SaveOutlined />}
            >
              Lưu thông tin phiếu
            </Button>
          ) : null}
        </Form>
      </Card>

      {/* =====================================================
          2. ITEMS
      ===================================================== */}
      <Card
        title="2. Thuốc trong phiếu"
        style={{ marginBottom: 16 }}
        extra={
          currentReceipt ? (
            <Text type="secondary">
              {items.length} dòng thuốc · Tổng {formatCurrency(totalAmount)} đ
            </Text>
          ) : null
        }
      >
        {!currentReceipt ? (
          <Alert
            showIcon
            type="info"
            message="Hãy tạo hoặc mở một phiếu trước khi thêm thuốc."
          />
        ) : (
          <>
            {editable && (
              <Form<ItemFormValues>
                form={itemForm}
                layout="vertical"
                onFinish={handleSaveItem}
              >
                <Row gutter={16}>
                  <Col xs={24} lg={12}>
                    <Form.Item
                      label="Thuốc"
                      name="medicine_id"
                      rules={[{ required: true, message: "Chọn thuốc" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder={
                          watchedSupplierId
                            ? "Tìm theo ID, mã hoặc tên thuốc"
                            : "Chọn nhà cung cấp trước"
                        }
                        disabled={!watchedSupplierId}
                        options={availableMedicines.map((medicine) => ({
                          value: medicine.id,
                          label: `#${medicine.id} | ${medicine.medicine_code} - ${medicine.name}${
                            medicine.strength ? ` - ${medicine.strength}` : ""
                          }`,
                        }))}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} lg={12}>
                    <Form.Item
                      label="Số lô"
                      name="lot_number"
                      rules={[{ required: true, message: "Nhập số lô" }]}
                    >
                      <Input maxLength={100} />
                    </Form.Item>
                  </Col>
                </Row>

                {watchedMedicineId && watchedWarehouseId && (
                  <Card
                    size="small"
                    style={{
                      marginBottom: 16,
                      background: "#fafafa",
                    }}
                  >
                    {selectedThreshold?.threshold_id != null ? (
                      <Row gutter={[16, 12]} align="middle">
                        <Col xs={24} md={6}>
                          <Text type="secondary">Tồn khả dụng hiện tại</Text>
                          <br />
                          <Text strong style={{ fontSize: 16 }}>
                            {getStockNumber(
                              selectedThreshold.usable_stock,
                            ).toLocaleString("vi-VN")}{" "}
                            {selectedThreshold.unit ||
                              selectedMedicine?.unit ||
                              "đơn vị"}
                          </Text>
                        </Col>

                        <Col xs={24} md={6}>
                          <Text type="secondary">Ngưỡng tồn tối thiểu</Text>
                          <br />
                          <Text strong style={{ fontSize: 16 }}>
                            {getStockNumber(
                              selectedThreshold.minimum_stock,
                            ).toLocaleString("vi-VN")}{" "}
                            {selectedThreshold.unit ||
                              selectedMedicine?.unit ||
                              "đơn vị"}
                          </Text>
                        </Col>

                        <Col xs={24} md={6}>
                          <Text type="secondary">Đề nghị nhập</Text>
                          <br />
                          <Text strong style={{ fontSize: 16 }}>
                            {getStockNumber(
                              selectedThreshold.reorder_quantity,
                            ).toLocaleString("vi-VN")}{" "}
                            {selectedThreshold.unit ||
                              selectedMedicine?.unit ||
                              "đơn vị"}
                          </Text>
                        </Col>

                        <Col xs={24} md={6}>
                          <Space
                            direction="vertical"
                            size={4}
                            style={{ width: "100%" }}
                          >
                            <Tag
                              color={
                                selectedThreshold.stock_status ===
                                "OUT_OF_STOCK"
                                  ? "red"
                                  : selectedThreshold.stock_status ===
                                      "LOW_STOCK"
                                    ? "orange"
                                    : "green"
                              }
                            >
                              {selectedThreshold.stock_status_label ||
                                "Đã cấu hình"}
                            </Tag>

                            {canCreate && (
                              <Button
                                size="small"
                                icon={<SettingOutlined />}
                                onClick={openThresholdModal}
                              >
                                Chỉnh ngưỡng
                              </Button>
                            )}
                          </Space>
                        </Col>
                      </Row>
                    ) : (
                      <Alert
                        showIcon
                        type="warning"
                        message="Thuốc này chưa được cấu hình ngưỡng tồn tại kho đã chọn"
                        description={
                          <Space
                            direction="vertical"
                            size={8}
                            style={{ width: "100%" }}
                          >
                            <Text>
                              Bạn vẫn có thể tiếp tục nhập thuốc. Ngưỡng tồn
                              chỉ cần thiết lập một lần cho từng thuốc tại
                              từng kho.
                            </Text>

                            {canCreate && (
                              <Button
                                type="primary"
                                size="small"
                                icon={<SettingOutlined />}
                                onClick={openThresholdModal}
                              >
                                Thiết lập ngưỡng
                              </Button>
                            )}
                          </Space>
                        }
                      />
                    )}
                  </Card>
                )}

                <Row gutter={16}>
                  <Col xs={24} lg={8}>
                    <Form.Item
                      label="Hạn sử dụng"
                      name="expiry_date"
                      rules={[{ required: true, message: "Chọn hạn sử dụng" }]}
                    >
                      <DatePicker
                        format="DD/MM/YYYY"
                        style={{ width: "100%" }}
                        disabledDate={(current) =>
                          Boolean(current && current <= dayjs().endOf("day"))
                        }
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} lg={8}>
                    <Form.Item
                      label="Số lượng"
                      name="quantity"
                      rules={[
                        { required: true, message: "Nhập số lượng" },
                        {
                          validator: async (_, value) => {
                            if (value === undefined || value === null || value === "") {
                              return;
                            }

                            const quantity = Number(value);

                            if (!Number.isFinite(quantity) || quantity <= 0) {
                              throw new Error("Số lượng phải lớn hơn 0");
                            }

                            if (!Number.isInteger(quantity)) {
                              throw new Error("Số lượng phải là số nguyên");
                            }
                          },
                        },
                      ]}
                    >
                      <InputNumber
                        precision={0}
                        style={{ width: "100%" }}
                        addonAfter={selectedMedicine?.unit || "Đơn vị"}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} lg={8}>
                    <Form.Item
                      label="Đơn giá"
                      name="unit_price"
                      rules={[
                        {
                          required: true,
                          message: "Nhập đơn giá",
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

                            const unitPrice = Number(value);

                            if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
                              throw new Error("Đơn giá phải lớn hơn 0");
                            }

                            if (!Number.isInteger(unitPrice)) {
                              throw new Error("Đơn giá phải là số nguyên");
                            }
                          },
                        },
                      ]}
                    >
                      <InputNumber
                        precision={0}
                        style={{ width: "100%" }}
                        addonAfter="đ"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={savingItem}
                    icon={editingItemId ? <SaveOutlined /> : <PlusOutlined />}
                  >
                    {editingItemId ? "Cập nhật thuốc" : "Thêm thuốc vào phiếu"}
                  </Button>

                  {editingItemId && (
                    <Button onClick={handleCancelEditItem}>Hủy sửa</Button>
                  )}
                </Space>
              </Form>
            )}

            {!editable && (
              <Alert
                showIcon
                type={currentStatus === "APPROVED" ? "success" : "info"}
                style={{ marginBottom: 16 }}
                message={
                  currentStatus === "PENDING"
                    ? "Phiếu đang ở bước kiểm tra nên tạm khóa chỉnh sửa. Nếu cần sửa, hãy bấm Từ chối để chỉnh sửa."
                    : "Phiếu đã nhập kho nên không thể chỉnh sửa thuốc."
                }
              />
            )}

            <Table<PurchaseReceiptItem>
              rowKey={(record) =>
                String(record.id ?? `${record.medicine_id}-${record.lot_number}`)
              }
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              scroll={{ x: 1100 }}
              style={{ marginTop: editable ? 20 : 0 }}
              locale={{ emptyText: "Phiếu chưa có thuốc" }}
            />
          </>
        )}
      </Card>

      {/* =====================================================
          3. TỰ KIỂM TRA / NHẬP KHO
      ===================================================== */}
      <Card title="3. Kiểm tra và nhập kho" style={{ marginBottom: 16 }}>
        {!currentReceipt ? (
          <Alert
            showIcon
            type="info"
            message="Chưa chọn phiếu nhập."
          />
        ) : currentStatus === "APPROVED" ? (
          <Alert
            showIcon
            type="success"
            icon={<CheckCircleOutlined />}
            message="Phiếu đã hoàn tất và thuốc đã được nhập kho"
            description={`Thuốc đã được cộng vào ${getWarehouseName(
              currentReceipt,
            )} lúc ${formatDateTime(currentReceipt.approved_at)}.`}
          />
        ) : (currentStatus === "DRAFT" ||
          currentStatus === "RETURNED") &&
          canCreate ? (
          <>
            {currentReceipt.rejection_reason && (
              <Alert
                showIcon
                type="warning"
                style={{ marginBottom: 16 }}
                message="Phiếu đã được trả về để chỉnh sửa"
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      Lý do: {currentReceipt.rejection_reason}
                    </Text>

                    {currentReceipt.rejected_at && (
                      <Text type="secondary">
                        Thời điểm:{" "}
                        {formatDateTime(
                          currentReceipt.rejected_at,
                        )}
                      </Text>
                    )}
                  </Space>
                }
              />
            )}

            <Alert
              showIcon
              type="info"
              style={{ marginBottom: 16 }}
              message="Kiểm tra thông tin trước khi nhập kho"
              description="Bước này chỉ khóa phiếu để người lập tự kiểm tra. Phiếu không được gửi cho người khác duyệt."
            />

            <Popconfirm
              title="Chuyển sang bước kiểm tra?"
              description="Sau khi chuyển sang bước kiểm tra, phiếu sẽ tạm khóa chỉnh sửa. Nếu phát hiện sai, bạn có thể bấm Từ chối để chỉnh sửa và phiếu sẽ trở về trạng thái Mới."
              okText="Kiểm tra phiếu"
              cancelText="Hủy"
              onConfirm={() => void handleReviewReceipt()}
            >
              <Button
                type="primary"
                loading={reviewing}
                icon={<CheckCircleOutlined />}
                disabled={items.length === 0}
              >
                Kiểm tra phiếu
              </Button>
            </Popconfirm>
          </>
        ) : currentStatus === "PENDING" &&
          canCreate ? (
          <>
            <Alert
              showIcon
              type="warning"
              style={{ marginBottom: 16 }}
              message="Phiếu đang được kiểm tra"
              description={`Hãy kiểm tra lại thông tin phiếu và thuốc. Nếu đúng, bấm Nhập kho để cộng tồn vào ${getWarehouseName(
                currentReceipt,
              )}. Nếu sai, bấm Từ chối để chỉnh sửa.`}
            />

            <Space wrap>
              <Popconfirm
                title="Xác nhận nhập kho?"
                description={`Toàn bộ thuốc trong phiếu sẽ được cộng vào ${getWarehouseName(
                  currentReceipt,
                )}. Sau khi nhập kho sẽ không thể chỉnh sửa phiếu.`}
                okText="Nhập kho"
                cancelText="Hủy"
                onConfirm={() => void handleCompleteReceipt()}
              >
                <Button
                  type="primary"
                  loading={completing}
                  icon={<CheckCircleOutlined />}
                >
                  Nhập kho
                </Button>
              </Popconfirm>

              <Button
                danger
                icon={<StopOutlined />}
                disabled={completing}
                onClick={openRejectModal}
              >
                Từ chối để chỉnh sửa
              </Button>
            </Space>
          </>
        ) : (
          <Alert
            showIcon
            type="error"
            message="Trạng thái phiếu không còn được xử lý trong luồng nhập thuốc hiện tại."
          />
        )}

        {currentReceipt && (
          <Button
            icon={<ReloadOutlined />}
            style={{ marginTop: 16 }}
            onClick={() => void reloadReceipt(currentReceipt.id)}
          >
            Làm mới trạng thái
          </Button>
        )}
      </Card>

      {/* =====================================================
          4. HISTORY
      ===================================================== */}
      <Card
        title="4. Danh sách phiếu nhập"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={historyLoading}
            onClick={() => void loadReceiptHistory(true)}
          >
            Làm mới
          </Button>
        }
      >
        <Space wrap size={12} style={{ marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={historySearch}
            placeholder="Mã phiếu, số hóa đơn, NCC, kho..."
            style={{ width: 320 }}
            onChange={(event) => setHistorySearch(event.target.value)}
            onPressEnter={() => void loadReceiptHistory()}
          />

          <Select
            allowClear
            placeholder="Trạng thái"
            value={historyStatus}
            style={{ width: 180 }}
            options={[
              { value: "DRAFT", label: "Mới" },
              { value: "APPROVED", label: "Đã nhập kho" },
              { value: "PENDING", label: "Đang kiểm tra" },
              { value: "RETURNED", label: "Cần chỉnh sửa (dữ liệu cũ)" },
            ]}
            onChange={(value) => setHistoryStatus(value)}
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Nhà cung cấp"
            value={historySupplier}
            style={{ width: 260 }}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: `${supplier.supplier_code} - ${supplier.name}`,
            }))}
            onChange={(value) => setHistorySupplier(value)}
          />

          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => void loadReceiptHistory()}
          >
            Tìm kiếm
          </Button>

          <Button onClick={handleResetHistory}>Làm mới bộ lọc</Button>
        </Space>

        <Space wrap size={18} style={{ marginBottom: 16 }}>
          <Statistic title="Tổng phiếu" value={receipts.length} />
          <Statistic
            title="Mới"
            value={receipts.filter((item) => item.status === "DRAFT").length}
          />
          <Statistic
            title="Đang kiểm tra"
            value={
              receipts.filter(
                (item) => item.status === "PENDING",
              ).length
            }
          />
          <Statistic
            title="Đã nhập kho"
            value={receipts.filter((item) => item.status === "APPROVED").length}
          />
        </Space>

        <Table<PurchaseReceipt>
          rowKey="id"
          columns={receiptColumns}
          dataSource={receipts}
          loading={historyLoading}
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `Tổng ${total} phiếu nhập`,
          }}
        />
      </Card>

      <Modal
        title="Từ chối để chỉnh sửa"
        open={rejectModalOpen}
        centered
        okText="Từ chối và chỉnh sửa"
        cancelText="Hủy"
        confirmLoading={rejecting}
        okButtonProps={{ danger: true }}
        onCancel={() => {
          if (rejecting) return;
          setRejectModalOpen(false);
          setRejectReason("");
        }}
        onOk={() => void handleRejectToDraft()}
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="Phiếu sẽ trở về trạng thái Mới"
          description="Tồn kho chưa thay đổi. Sau khi từ chối, bạn có thể sửa thông tin phiếu và thuốc rồi chuyển sang bước kiểm tra lại."
        />

        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          value={rejectReason}
          placeholder="Nhập lý do cần chỉnh sửa..."
          onChange={(event) =>
            setRejectReason(event.target.value)
          }
        />
      </Modal>

      {/* =====================================================
          THRESHOLD MODAL
      ===================================================== */}
      <Modal
        title="Thiết lập ngưỡng tồn kho"
        open={thresholdModalOpen}
        centered
        okText="Lưu ngưỡng"
        cancelText="Hủy"
        confirmLoading={thresholdSaving}
        onOk={() => void handleSaveThreshold()}
        onCancel={() => setThresholdModalOpen(false)}
      >
        <Space
          direction="vertical"
          size={16}
          style={{ width: "100%" }}
        >
          <Alert
            type="info"
            showIcon
            message={`${selectedMedicine?.medicine_code || ""} - ${
              selectedMedicine?.name || "Thuốc"
            }`}
            description={`Kho: ${
              warehouses.find(
                (warehouse) => warehouse.id === watchedWarehouseId,
              )?.name || "-"
            } · Tồn khả dụng hiện tại: ${getStockNumber(
              selectedThreshold?.usable_stock,
            ).toLocaleString("vi-VN")} ${
              selectedThreshold?.unit ||
              selectedMedicine?.unit ||
              "đơn vị"
            }`}
          />

          <div>
            <Text strong>Ngưỡng tồn tối thiểu</Text>

            <InputNumber
              min={1}
              precision={0}
              value={thresholdMinimumStock}
              placeholder="Ví dụ: 10"
              style={{ width: "100%", marginTop: 6 }}
              addonAfter={selectedMedicine?.unit || "Đơn vị"}
              onChange={(value) =>
                setThresholdMinimumStock(
                  value === null ? null : Number(value),
                )
              }
            />

            <div style={{ marginTop: 4 }}>
              <Text type="secondary">
                Khi tồn khả dụng lớn hơn 0 nhưng nhỏ hơn hoặc bằng
                mức này, hệ thống sẽ báo “Sắp hết hàng”.
              </Text>
            </div>
          </div>

          <div>
            <Text strong>Số lượng đề nghị nhập</Text>

            <InputNumber
              min={1}
              precision={0}
              value={thresholdReorderQuantity}
              placeholder="Ví dụ: 30"
              style={{ width: "100%", marginTop: 6 }}
              addonAfter={selectedMedicine?.unit || "Đơn vị"}
              onChange={(value) =>
                setThresholdReorderQuantity(
                  value === null ? null : Number(value),
                )
              }
            />

            <div style={{ marginTop: 4 }}>
              <Text type="secondary">
                Đây chỉ là số lượng gợi ý để nhân viên tham khảo,
                không tự động thay đổi số lượng nhập trong phiếu.
              </Text>
            </div>
          </div>
        </Space>
      </Modal>

      {/* =====================================================
          DETAIL DRAWER
      ===================================================== */}
      <Drawer
        title={
          selectedReceipt
            ? `Chi tiết ${
                selectedReceipt.receipt_code ||
                `PN${String(selectedReceipt.id).padStart(6, "0")}`
              }`
            : "Chi tiết phiếu nhập"
        }
        width={900}
        open={drawerOpen}
        loading={drawerLoading}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setSelectedReceipt(null);
          setSelectedReceiptItems([]);
        }}
      >
        {selectedReceipt && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Mã phiếu">
                {selectedReceipt.receipt_code ||
                  `PN${String(selectedReceipt.id).padStart(6, "0")}`}
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag color={getStatusColor(selectedReceipt.status)}>
                  {getStatusLabel(selectedReceipt.status)}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Nhà cung cấp">
                {getSupplierName(selectedReceipt)}
              </Descriptions.Item>

              <Descriptions.Item label="Kho nhập">
                <Text strong>{getWarehouseName(selectedReceipt)}</Text>
              </Descriptions.Item>

              <Descriptions.Item label="Số hóa đơn">
                {selectedReceipt.invoice_number || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Seri hóa đơn">
                {selectedReceipt.invoice_serial || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày hóa đơn">
                {formatDate(selectedReceipt.invoice_date)}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày tạo">
                {formatDateTime(selectedReceipt.created_at)}
              </Descriptions.Item>

              {selectedReceipt.submitted_at && (
                <Descriptions.Item label="Thời gian chuyển sang kiểm tra">
                  {formatDateTime(selectedReceipt.submitted_at)}
                </Descriptions.Item>
              )}

              <Descriptions.Item label="Thời gian nhập kho">
                {formatDateTime(selectedReceipt.approved_at)}
              </Descriptions.Item>

              <Descriptions.Item label="Người tạo">
                {getUserLabel(selectedReceipt.created_by)}
              </Descriptions.Item>

              <Descriptions.Item label="Người hoàn tất nhập kho">
                {getUserLabel(selectedReceipt.approved_by)}
              </Descriptions.Item>

              {(selectedReceipt.rejected_by ||
                selectedReceipt.rejected_at ||
                selectedReceipt.rejection_reason) && (
                <>
                  <Descriptions.Item label="Người trả về (dữ liệu cũ)">
                    {getUserLabel(selectedReceipt.rejected_by)}
                  </Descriptions.Item>

                  <Descriptions.Item label="Ngày trả về (dữ liệu cũ)">
                    {formatDateTime(selectedReceipt.rejected_at)}
                  </Descriptions.Item>

                  <Descriptions.Item
                    label="Lý do trả về (dữ liệu cũ)"
                    span={2}
                  >
                    {selectedReceipt.rejection_reason || "-"}
                  </Descriptions.Item>
                </>
              )}

              <Descriptions.Item label="Ghi chú" span={2}>
                {selectedReceipt.note || "-"}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 24 }}>
              Thuốc trong phiếu
            </Title>

            <Table<PurchaseReceiptItem>
              rowKey={(record) =>
                String(record.id ?? `${record.medicine_id}-${record.lot_number}`)
              }
              columns={itemColumns.filter((column) => column.key !== "actions")}
              dataSource={selectedReceiptItems}
              pagination={false}
              scroll={{ x: 1000 }}
              locale={{ emptyText: "Phiếu không có thuốc" }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <Text strong style={{ fontSize: 16 }}>
                Tổng tiền: {formatCurrency(detailTotal)} đ
              </Text>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

export default PurchaseReceipts;
