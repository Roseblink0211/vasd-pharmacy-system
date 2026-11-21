import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";

import {
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================
   TYPES
========================= */

interface WarehouseInfo {
  id?: number;
  warehouse_code?: string;
  name?: string;
  warehouse_type?: string;
}

interface MedicineInfo {
  id?: number;
  medicine_code?: string;
  name?: string;
  active_ingredient?: string | null;
  strength?: string | null;
  unit?: string | null;
}

interface MedicineOption {
  id: number;
  medicine_code?: string;
  name?: string;
}

interface BatchInfo {
  id?: number;
  lot_number?: string;
  expiry_date?: string | null;
}

interface CreatedByInfo {
  id?: number;
  full_name?: string;
  email?: string;
}

interface StockMovement {
  id?: number;

  warehouse?: WarehouseInfo;

  medicine?: MedicineInfo;

  batch?: BatchInfo;

  movement_type?: string;

  direction?: string;

  quantity?: number | string;

  signed_quantity?: number | string;

  reference_type?: string | null;

  reference_id?: number | null;

  reference_code?: string | null;

  note?: string | null;

  created_by_id?: number | null;

  created_by?: CreatedByInfo | number | null;

  created_at?: string | null;
}

interface WarehouseTransfer {
  id: number;

  transfer_code?: string;

  source_warehouse_id?: number;

  destination_warehouse_id?: number;

  source_warehouse_name?: string;

  destination_warehouse_name?: string;

  source_warehouse?: WarehouseInfo;

  destination_warehouse?: WarehouseInfo;
}

interface DisplayMovement extends StockMovement {
  displayWarehouseId?: number;

  displayWarehouseCode: string;

  displayWarehouseName: string;

  displayMedicineCode: string;

  displayMedicineName: string;

  displayUnit: string;

  displayLotNumber: string;

  displayExpiryDate?: string | null;

  routeText: string;

  routeDescription: string;

  performedByName: string;

  performedByEmail: string;
}

/* =========================
   NORMALIZE
========================= */

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

/* =========================
   MOVEMENT HELPERS
========================= */

function getMovementLabel(type?: string) {
  switch (type) {
    case "IMPORT":
      return "Nhập kho";

    case "TRANSFER_OUT":
      return "Chuyển kho - Xuất";

    case "TRANSFER_IN":
      return "Chuyển kho - Nhập";

    case "SALE_OUT":
      return "Bán thuốc";

    case "CUSTOMER_RETURN":
      return "Hoàn khách hàng";

    case "RETURN_SUPPLIER":
      return "Trả NCC";

    default:
      return type || "-";
  }
}

function getMovementColor(type?: string) {
  switch (type) {
    case "IMPORT":
      return "green";

    case "TRANSFER_IN":
      return "blue";

    case "TRANSFER_OUT":
      return "orange";

    case "SALE_OUT":
      return "purple";

    case "CUSTOMER_RETURN":
      return "cyan";

    case "RETURN_SUPPLIER":
      return "red";

    default:
      return "default";
  }
}

/* =========================
   DIRECTION
========================= */

function getDirection(movement: StockMovement) {
  if (movement.direction === "IN" || movement.direction === "OUT") {
    return movement.direction;
  }

  switch (movement.movement_type) {
    case "IMPORT":
    case "TRANSFER_IN":
    case "CUSTOMER_RETURN":
      return "IN";

    case "TRANSFER_OUT":
    case "SALE_OUT":
    case "RETURN_SUPPLIER":
      return "OUT";

    default:
      return "OTHER";
  }
}

function getDirectionLabel(movement: StockMovement) {
  const direction = getDirection(movement);

  if (direction === "IN") {
    return "Vào kho";
  }

  if (direction === "OUT") {
    return "Ra kho";
  }

  return "-";
}

function getDirectionColor(movement: StockMovement) {
  const direction = getDirection(movement);

  if (direction === "IN") {
    return "green";
  }

  if (direction === "OUT") {
    return "red";
  }

  return "default";
}

/* =========================
   QUANTITY
========================= */

function getSignedQuantity(movement: StockMovement) {
  if (
    movement.signed_quantity !== undefined &&
    movement.signed_quantity !== null
  ) {
    return Number(movement.signed_quantity);
  }

  const quantity = Math.abs(Number(movement.quantity || 0));

  if (getDirection(movement) === "OUT") {
    return -quantity;
  }

  return quantity;
}

/* =========================
   DATE
========================= */

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

/* =========================
   WAREHOUSE
========================= */

function fallbackWarehouseName(id?: number) {
  if (id === 1) {
    return "Kho chính";
  }

  if (id === 2) {
    return "Kho bán";
  }

  return undefined;
}

/* =========================
   TRANSFER
========================= */

function getSourceName(transfer?: WarehouseTransfer) {
  const id =
    transfer?.source_warehouse?.id ??
    transfer?.source_warehouse_id;

  return (
    transfer?.source_warehouse?.name ||
    transfer?.source_warehouse_name ||
    fallbackWarehouseName(id)
  );
}

function getDestinationName(transfer?: WarehouseTransfer) {
  const id =
    transfer?.destination_warehouse?.id ?? transfer?.destination_warehouse_id;

  return (
    transfer?.destination_warehouse?.name ||
    transfer?.destination_warehouse_name ||
    fallbackWarehouseName(id)
  );
}

/* =========================
   ROUTE
========================= */

function buildRoute(
  movement: StockMovement,
  warehouseName: string,
  transfer?: WarehouseTransfer,
) {
  const sourceName = getSourceName(transfer);

  const destinationName = getDestinationName(transfer);

  switch (movement.movement_type) {
    case "TRANSFER_OUT":
      if (sourceName && destinationName) {
        return {
          routeText: `${sourceName} → ${destinationName}`,

          routeDescription: `Xuất sang ${destinationName}`,
        };
      }

      return {
        routeText: warehouseName,

        routeDescription: "Xuất chuyển kho",
      };

    case "TRANSFER_IN":
      if (sourceName && destinationName) {
        return {
          routeText: `${sourceName} → ${destinationName}`,

          routeDescription: `Nhập từ ${sourceName}`,
        };
      }

      return {
        routeText: warehouseName,

        routeDescription: "Nhập chuyển kho",
      };

    case "IMPORT":
      return {
        routeText: `Nhà cung cấp → ${warehouseName}`,

        routeDescription: `Nhập vào ${warehouseName}`,
      };

    case "RETURN_SUPPLIER":
      return {
        routeText: `${warehouseName} → Nhà cung cấp`,

        routeDescription: `Trả từ ${warehouseName}`,
      };

    default:
      return {
        routeText: warehouseName,

        routeDescription: "-",
      };
  }
}

/* =========================
   AUDIT USER
========================= */

function getPerformedByName(movement: StockMovement) {
  if (typeof movement.created_by === "object" && movement.created_by !== null) {
    return (
      movement.created_by.full_name ||
      `Người dùng #${movement.created_by.id ?? "?"}`
    );
  }

  if (typeof movement.created_by === "number") {
    return `Người dùng #${movement.created_by}`;
  }

  if (movement.created_by_id) {
    return `Người dùng #${movement.created_by_id}`;
  }

  return "Không xác định";
}

function getPerformedByEmail(movement: StockMovement) {
  if (typeof movement.created_by === "object" && movement.created_by !== null) {
    return movement.created_by.email || "";
  }

  return "";
}

/* =========================
   COMPONENT
========================= */

function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);

  const [medicines, setMedicines] = useState<MedicineOption[]>([]);

  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);

  const [loading, setLoading] = useState(true);

  const [permissions, setPermissions] =
    useState<string[]>([]);

  const [permissionReady, setPermissionReady] =
    useState(false);

  const canView =
    permissions.includes("STOCK_HISTORY_VIEW");

  const canTransferView =
    permissions.includes("TRANSFER_VIEW");

  const canMedicineView =
    permissions.includes("MEDICINE_VIEW");

  const canWarehouseView =
    permissions.includes("WAREHOUSE_VIEW");

  /* =========================
     FILTER STATE
  ========================= */

  const [search, setSearch] = useState("");

  const [movementFilter, setMovementFilter] = useState<string | undefined>();

  const [warehouseFilter, setWarehouseFilter] = useState<number | undefined>();

  const [medicineFilter, setMedicineFilter] = useState<number | undefined>();

  /* =========================
     REQUEST PARAMS
  ========================= */

  const buildParams = (
    searchValue = search,
    warehouseValue = warehouseFilter,
    movementValue = movementFilter,
    medicineValue = medicineFilter,
  ) => {
    const params: {
      search?: string;
      warehouse_id?: number;
      movement_type?: string;
      medicine_id?: number;
    } = {};

    const keyword = searchValue.trim();

    if (keyword) {
      params.search = keyword;
    }

    if (warehouseValue !== undefined) {
      params.warehouse_id = warehouseValue;
    }

    if (movementValue) {
      params.movement_type = movementValue;
    }

    if (medicineValue !== undefined) {
      params.medicine_id = medicineValue;
    }

    return params;
  };

  /* =========================
     LOAD PERMISSIONS
  ========================= */

  useEffect(() => {
    let cancelled = false;

    const loadPermissions = async () => {
      try {
        const response = await api.get("/users/me");

        if (cancelled) return;

        const codes =
          Array.isArray(response.data?.permissions)
            ? (response.data.permissions as unknown[]).filter(
                (value): value is string =>
                  typeof value === "string",
              )
            : [];

        setPermissions(codes);
      } catch (error) {
        console.error(
          "Load stock movement permissions:",
          error,
        );
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

  /* =========================
     INITIAL LOAD
  ========================= */

  useEffect(() => {
    if (!permissionReady || !canView) {
      return;
    }

    let cancelled = false;

    const loadInitialData = async () => {
      try {
        setLoading(true);

        const requests: Array<Promise<void>> = [];

        requests.push(
          api
            .get("/stock-movements")
            .then((response) => {
              if (cancelled) return;

              setMovements(
                normalizeArray<StockMovement>(
                  response.data,
                  [
                    "data",
                    "movements",
                    "stock_movements",
                  ],
                ),
              );
            }),
        );

        if (canTransferView) {
          requests.push(
            api
              .get("/warehouse-transfers")
              .then((response) => {
                if (cancelled) return;

                setTransfers(
                  normalizeArray<WarehouseTransfer>(
                    response.data,
                    [
                      "data",
                      "transfers",
                      "warehouse_transfers",
                    ],
                  ),
                );
              }),
          );
        } else {
          setTransfers([]);
        }

        if (canMedicineView) {
          requests.push(
            api
              .get("/medicines")
              .then((response) => {
                if (cancelled) return;

                setMedicines(
                  normalizeArray<MedicineOption>(
                    response.data,
                    ["data", "medicines"],
                  ),
                );
              }),
          );
        } else {
          setMedicines([]);
        }

        if (canWarehouseView) {
          requests.push(
            api
              .get("/warehouses", {
                params: {
                  is_active: true,
                },
              })
              .then((response) => {
                if (cancelled) return;

                setWarehouses(
                  normalizeArray<WarehouseInfo>(
                    response.data,
                    ["data", "warehouses"],
                  ),
                );
              }),
          );
        } else {
          setWarehouses([]);
        }

        await Promise.all(requests);
      } catch (error) {
        console.error(
          "Load StockMovements:",
          error,
        );

        if (!cancelled) {
          message.error(
            "Không thể tải lịch sử kho",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [
    permissionReady,
    canView,
    canTransferView,
    canMedicineView,
    canWarehouseView,
  ]);

  /* =========================
     LOAD FILTERED MOVEMENTS
  ========================= */

  const loadMovements = async (
    params: {
      search?: string;
      warehouse_id?: number;
      movement_type?: string;
      medicine_id?: number;
    } = buildParams(),
  ) => {
    try {
      setLoading(true);

      const response = await api.get("/stock-movements", {
        params,
      });

      setMovements(
        normalizeArray<StockMovement>(response.data, [
          "data",
          "movements",
          "stock_movements",
        ]),
      );
    } catch (error) {
      console.error("Filter stock movements:", error);

      message.error("Không thể lọc lịch sử kho");
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     REFRESH EVERYTHING
  ========================= */

  const handleReload = async () => {
    try {
      setLoading(true);

      const requests: Array<Promise<void>> = [];

      requests.push(
        api
          .get("/stock-movements", {
            params: buildParams(),
          })
          .then((response) => {
            setMovements(
              normalizeArray<StockMovement>(
                response.data,
                [
                  "data",
                  "movements",
                  "stock_movements",
                ],
              ),
            );
          }),
      );

      if (canTransferView) {
        requests.push(
          api
            .get("/warehouse-transfers")
            .then((response) => {
              setTransfers(
                normalizeArray<WarehouseTransfer>(
                  response.data,
                  [
                    "data",
                    "transfers",
                    "warehouse_transfers",
                  ],
                ),
              );
            }),
        );
      }

      if (canMedicineView) {
        requests.push(
          api
            .get("/medicines")
            .then((response) => {
              setMedicines(
                normalizeArray<MedicineOption>(
                  response.data,
                  ["data", "medicines"],
                ),
              );
            }),
        );
      }

      if (canWarehouseView) {
        requests.push(
          api
            .get("/warehouses", {
              params: {
                is_active: true,
              },
            })
            .then((response) => {
              setWarehouses(
                normalizeArray<WarehouseInfo>(
                  response.data,
                  ["data", "warehouses"],
                ),
              );
            }),
        );
      }

      await Promise.all(requests);

      message.success(
        "Đã cập nhật lịch sử kho",
      );
    } catch (error) {
      console.error("Reload:", error);

      message.error(
        "Không thể tải lại lịch sử kho",
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     RESET FILTER
  ========================= */

  const handleReset = () => {
    setSearch("");

    setWarehouseFilter(undefined);

    setMovementFilter(undefined);

    setMedicineFilter(undefined);

    void loadMovements({});
  };

  /* =========================
     TRANSFER MAPS
  ========================= */

  const transferCodeMap = useMemo(() => {
    const map = new Map<string, WarehouseTransfer>();

    transfers.forEach((transfer) => {
      if (transfer.transfer_code) {
        map.set(transfer.transfer_code, transfer);
      }
    });

    return map;
  }, [transfers]);

  const transferIdMap = useMemo(() => {
    const map = new Map<number, WarehouseTransfer>();

    transfers.forEach((transfer) => {
      map.set(transfer.id, transfer);
    });

    return map;
  }, [transfers]);

  /* =========================
     DISPLAY DATA
  ========================= */

  const displayMovements = useMemo(() => {
    return movements.map((movement): DisplayMovement => {
      const warehouseId = movement.warehouse?.id;

      const warehouseName =
        movement.warehouse?.name ||
        fallbackWarehouseName(warehouseId) ||
        "Không xác định";

      const warehouseCode = movement.warehouse?.warehouse_code || "-";

      const medicineCode = movement.medicine?.medicine_code || "-";

      const medicineName = movement.medicine?.name || "-";

      const medicineUnit = movement.medicine?.unit || "";

      const lotNumber = movement.batch?.lot_number || "-";

      const expiryDate = movement.batch?.expiry_date || null;

      let transfer: WarehouseTransfer | undefined;

      if (movement.reference_code) {
        transfer = transferCodeMap.get(movement.reference_code);
      }

      if (!transfer && movement.reference_id) {
        transfer = transferIdMap.get(movement.reference_id);
      }

      const route = buildRoute(movement, warehouseName, transfer);

      return {
        ...movement,

        displayWarehouseId: warehouseId,

        displayWarehouseCode: warehouseCode,

        displayWarehouseName: warehouseName,

        displayMedicineCode: medicineCode,

        displayMedicineName: medicineName,

        displayUnit: medicineUnit,

        displayLotNumber: lotNumber,

        displayExpiryDate: expiryDate,

        routeText: route.routeText,

        routeDescription: route.routeDescription,

        performedByName: getPerformedByName(movement),

        performedByEmail: getPerformedByEmail(movement),
      };
    });
  }, [movements, transferCodeMap, transferIdMap]);

  /* =========================
     MEDICINE OPTIONS
  ========================= */

  const medicineOptions = useMemo(() => {
    return medicines.map((medicine) => ({
      value: medicine.id,

      label: `${medicine.medicine_code || `T${medicine.id}`} - ${
        medicine.name || "Không tên"
      }`,
    }));
  }, [medicines]);

  const warehouseOptions = useMemo(() => {
    return warehouses
      .filter(
        (warehouse): warehouse is WarehouseInfo & { id: number } =>
          typeof warehouse.id === "number",
      )
      .map((warehouse) => ({
        value: warehouse.id,
        label: warehouse.name
          ? `${warehouse.name}${
              warehouse.warehouse_code
                ? ` (${warehouse.warehouse_code})`
                : ""
            }`
          : warehouse.warehouse_code || `Kho #${warehouse.id}`,
      }));
  }, [warehouses]);

  /* =========================
     SUMMARY CURRENT RESULTS
  ========================= */

  const importCount = movements.filter(
    (movement) => movement.movement_type === "IMPORT",
  ).length;

  const transferCount = movements.filter(
    (movement) =>
      movement.movement_type === "TRANSFER_OUT" ||
      movement.movement_type === "TRANSFER_IN",
  ).length;

  const returnCount = movements.filter(
    (movement) => movement.movement_type === "RETURN_SUPPLIER",
  ).length;

  /* =========================
     TABLE COLUMNS
  ========================= */

  const columns = [
    {
      title: "Thời gian",

      key: "created_at",

      width: 165,

      render: (_: unknown, record: DisplayMovement) =>
        formatDateTime(record.created_at),
    },

    {
      title: "Loại biến động",

      key: "movement_type",

      width: 175,

      render: (_: unknown, record: DisplayMovement) => (
        <Tag color={getMovementColor(record.movement_type)}>
          {getMovementLabel(record.movement_type)}
        </Tag>
      ),
    },

    {
      title: "Hướng",

      key: "direction",

      width: 105,

      render: (_: unknown, record: DisplayMovement) => (
        <Tag color={getDirectionColor(record)}>{getDirectionLabel(record)}</Tag>
      ),
    },

    {
      title: "Kho biến động",

      key: "warehouse",

      width: 170,

      render: (_: unknown, record: DisplayMovement) => (
        <div>
          <Text strong>{record.displayWarehouseName}</Text>

          {record.displayWarehouseCode !== "-" && (
            <>
              <br />

              <Text type="secondary">{record.displayWarehouseCode}</Text>
            </>
          )}
        </div>
      ),
    },

    {
      title: "Nguồn / Đích",

      key: "route",

      width: 230,

      render: (_: unknown, record: DisplayMovement) => (
        <div>
          <Text strong>{record.routeText}</Text>

          <br />

          <Text type="secondary">{record.routeDescription}</Text>
        </div>
      ),
    },

    {
      title: "Thuốc",

      key: "medicine",

      width: 230,

      render: (_: unknown, record: DisplayMovement) => (
        <div>
          <Text strong>{record.displayMedicineCode}</Text>

          <br />

          <Text>{record.displayMedicineName}</Text>
        </div>
      ),
    },

    {
      title: "Số lô",

      key: "batch",

      width: 140,

      render: (_: unknown, record: DisplayMovement) => record.displayLotNumber,
    },

    {
      title: "HSD",

      key: "expiry",

      width: 125,

      render: (_: unknown, record: DisplayMovement) =>
        formatDate(record.displayExpiryDate),
    },

    {
      title: "Số lượng",

      key: "quantity",

      width: 125,

      render: (_: unknown, record: DisplayMovement) => {
        const quantity = getSignedQuantity(record);

        const unit = record.displayUnit;

        return (
          <Text
            strong
            type={quantity < 0 ? "danger" : undefined}
            style={
              quantity > 0
                ? {
                    color: "#389e0d",
                  }
                : undefined
            }
          >
            {quantity > 0 ? "+" : ""}

            {quantity.toLocaleString("vi-VN")}

            {unit ? ` ${unit}` : ""}
          </Text>
        );
      },
    },

    {
      title: "Chứng từ",

      key: "reference",

      width: 180,

      render: (_: unknown, record: DisplayMovement) => (
        <div>
          <Text strong>{record.reference_code || "-"}</Text>

          {record.reference_type && (
            <>
              <br />

              <Text type="secondary">{record.reference_type}</Text>
            </>
          )}
        </div>
      ),
    },

    {
      title: "Người thực hiện",

      key: "performed_by",

      width: 240,

      render: (_: unknown, record: DisplayMovement) => (
        <Space align="start">
          <UserOutlined
            style={{
marginTop: 4,
            }}
          />

          <div>
            <Text strong>{record.performedByName}</Text>

            {record.performedByEmail && (
              <>
                <br />

                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                  }}
                >
                  {record.performedByEmail}
                </Text>
              </>
            )}
          </div>
        </Space>
      ),
    },

    {
      title: "Ghi chú",

      key: "note",

      width: 220,

      render: (_: unknown, record: DisplayMovement) =>
        record.note || record.routeDescription || "-",
    },
  ];

  /* =========================
     UI
  ========================= */

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
        message="Bạn không có quyền xem Lịch sử kho"
        description="Tài khoản cần quyền STOCK_HISTORY_VIEW để truy cập trang này."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "flex-start",

          gap: 16,

          marginBottom: 24,
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              marginBottom: 4,
            }}
          >
            Lịch sử kho
          </Title>

          <Text type="secondary">
            Theo dõi biến động kho, chứng từ và người thực hiện
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void handleReload()}
        >
          Làm mới
        </Button>
      </div>

      {/* SUMMARY */}

      <Space
        wrap
        size={16}
        style={{
          width: "100%",

          marginBottom: 16,
        }}
      >
        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic title="Kết quả" value={movements.length} />
        </Card>

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic title="Nhập kho" value={importCount} />
        </Card>

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic title="Chuyển kho" value={transferCount} />
        </Card>

        <Card
          style={{
            minWidth: 190,
          }}
        >
          <Statistic title="Trả NCC" value={returnCount} />
        </Card>
      </Space>

      {/* FILTER */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Space wrap size={12}>
          <Input
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            placeholder="Thuốc, lô, chứng từ, người thực hiện..."
            style={{
              width: 340,
            }}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={() => void loadMovements()}
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Thuốc"
            value={medicineFilter}
            style={{
              width: 260,
            }}
            options={medicineOptions}
            onChange={(value) => setMedicineFilter(value)}
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Kho biến động"
            value={warehouseFilter}
            style={{
              width: 220,
            }}
            options={warehouseOptions}
            onChange={(value) => setWarehouseFilter(value)}
          />

          <Select
            allowClear
            placeholder="Loại biến động"
            value={movementFilter}
            style={{
              width: 210,
            }}
            onChange={(value) => setMovementFilter(value)}
            options={[
              {
                value: "IMPORT",

                label: "Nhập kho",
              },

              {
                value: "TRANSFER_OUT",

                label: "Chuyển kho - Xuất",
              },

              {
                value: "TRANSFER_IN",

                label: "Chuyển kho - Nhập",
              },

              {
                value: "RETURN_SUPPLIER",

                label: "Trả NCC",
              },
            ]}
          />

          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={() => void loadMovements()}
          >
            Tìm kiếm
          </Button>

          <Button onClick={handleReset}>Xóa bộ lọc</Button>
        </Space>
      </Card>

      {/* TABLE */}

      <Card title={`Biến động kho (${displayMovements.length})`}>
        <Table
          rowKey={(record) =>
            record.id ??
            `${record.created_at}-${record.reference_type}-${record.reference_id}-${record.movement_type}`
          }
          columns={columns}
          dataSource={displayMovements}
          loading={loading}
          scroll={{
            x: 2250,
          }}
          pagination={{
            pageSize: 10,

            showSizeChanger: true,

            showTotal: (total) => `Tổng ${total} biến động`,
          }}
          locale={{
            emptyText: "Không tìm thấy biến động kho",
          }}
        />
      </Card>
    </div>
  );
}

export default StockMovements;