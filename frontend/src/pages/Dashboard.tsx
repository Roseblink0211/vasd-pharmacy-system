import { useEffect, useState } from "react";

import { Alert, Card, Col, Row, Statistic, Table, Tag, Typography } from "antd";

import {
  DatabaseOutlined,
  MedicineBoxOutlined,
  ShopOutlined,
  TruckOutlined,
} from "@ant-design/icons";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================
   TYPES
========================= */

interface Warehouse {
  id: number;
  name: string;
  warehouse_code: string;
  warehouse_type: string;
}

interface InventoryItem {
  inventory_id: number;
  quantity: number | string;

  warehouse: Warehouse;

  medicine: {
    id: number;
    name: string;
    medicine_code: string;
  };

  lot_number: string;
  expiry_date: string;
}

interface PurchaseReceipt {
  id: number;
  receipt_code: string;
  invoice_number: string;
  status: string;

  supplier: {
    id: number;
    name: string;
  };
}

interface StockMovement {
  id: number;

  movement_type: string;

  signed_quantity: number | string;

  reference_code: string | null;

  medicine: {
    id: number;
    name: string;
  };

  warehouse: {
    id: number;
    name: string;
  };

  created_at: string;
}

/* =========================
   COMPONENT
========================= */

function Dashboard() {
  const [medicineCount, setMedicineCount] = useState(0);

  const [supplierCount, setSupplierCount] = useState(0);

  const [mainWarehouseQuantity, setMainWarehouseQuantity] = useState(0);

  const [saleWarehouseQuantity, setSaleWarehouseQuantity] = useState(0);

  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);

  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionReady, setPermissionReady] = useState(false);

  const canDashboard = permissions.includes("DASHBOARD_VIEW");
  const canMedicineView = permissions.includes("MEDICINE_VIEW");
  const canSupplierView = permissions.includes("SUPPLIER_VIEW");
  const canInventoryView = permissions.includes("INVENTORY_VIEW");
  const canPurchaseView = permissions.includes("PURCHASE_VIEW");
  const canStockHistoryView = permissions.includes("STOCK_HISTORY_VIEW");

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
        console.error("Load dashboard permissions:", error);
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
     LOAD DASHBOARD
  ========================= */

  useEffect(() => {
    if (!permissionReady || !canDashboard) {
      return;
    }

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const requests: Array<Promise<void>> = [];

        if (canMedicineView) {
          requests.push(
            api
              .get("/medicines")
              .then((response) => {
                setMedicineCount(
                  Number(response.data?.count ?? 0),
                );
              })
              .catch((error) => {
                console.error(
                  "Dashboard /medicines:",
                  error,
                );
              }),
          );
        }

        if (canSupplierView) {
          requests.push(
            api
              .get("/suppliers")
              .then((response) => {
                setSupplierCount(
                  Number(response.data?.count ?? 0),
                );
              })
              .catch((error) => {
                console.error(
                  "Dashboard /suppliers:",
                  error,
                );
              }),
          );
        }

        if (canInventoryView) {
          requests.push(
            api
              .get("/inventory")
              .then((response) => {
                const inventory: InventoryItem[] =
                  response.data?.data ?? [];

                let mainQuantity = 0;
                let saleQuantity = 0;

                inventory.forEach((item) => {
                  const quantity = Number(
                    item.quantity ?? 0,
                  );

                  if (
                    item.warehouse
                      ?.warehouse_type === "MAIN"
                  ) {
                    mainQuantity += quantity;
                  }

                  if (
                    item.warehouse
                      ?.warehouse_type === "SALE"
                  ) {
                    saleQuantity += quantity;
                  }
                });

                setMainWarehouseQuantity(
                  mainQuantity,
                );
                setSaleWarehouseQuantity(
                  saleQuantity,
                );
              })
              .catch((error) => {
                console.error(
                  "Dashboard /inventory:",
                  error,
                );
              }),
          );
        }

        if (canPurchaseView) {
          requests.push(
            api
              .get("/purchase-receipts")
              .then((response) => {
                const receiptData:
                  PurchaseReceipt[] =
                    response.data?.data ?? [];

                setReceipts(
                  receiptData.slice(0, 5),
                );
              })
              .catch((error) => {
                console.error(
                  "Dashboard /purchase-receipts:",
                  error,
                );
              }),
          );
        } else {
          setReceipts([]);
        }

        if (canStockHistoryView) {
          requests.push(
            api
              .get("/stock-movements")
              .then((response) => {
                const movementData:
                  StockMovement[] =
                    response.data?.data ?? [];

                setMovements(
                  movementData.slice(0, 6),
                );
              })
              .catch((error) => {
                console.error(
                  "Dashboard /stock-movements:",
                  error,
                );
              }),
          );
        } else {
          setMovements([]);
        }

        await Promise.all(requests);
      } catch (err) {
        console.error("Dashboard error:", err);
        setError(
          "Không thể tải một phần dữ liệu Dashboard.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [
    permissionReady,
    canDashboard,
    canMedicineView,
    canSupplierView,
    canInventoryView,
    canPurchaseView,
    canStockHistoryView,
  ]);

  /* =========================
     STATUS TAG
  ========================= */

  const renderStatus = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Tag color="green">Đã duyệt</Tag>;

      case "PENDING":
        return <Tag color="gold">Chờ duyệt</Tag>;

      case "RETURNED":
        return <Tag color="orange">Cần chỉnh sửa</Tag>;

      case "REJECTED":
        return <Tag color="red">Từ chối</Tag>;

      case "DRAFT":
        return <Tag>Mới</Tag>;

      case "COMPLETED":
        return <Tag color="green">Hoàn tất</Tag>;

      case "CANCELLED":
        return <Tag color="default">Đã hủy</Tag>;

      default:
        return <Tag>{status}</Tag>;
    }
  };

  /* =========================
     MOVEMENT LABEL
  ========================= */

  const renderMovementType = (type: string) => {
    switch (type) {
      case "IMPORT":
        return <Tag color="green">Nhập kho</Tag>;

      case "TRANSFER_OUT":
        return <Tag color="orange">Chuyển kho - Xuất</Tag>;

      case "TRANSFER_IN":
        return <Tag color="blue">Chuyển kho - Nhập</Tag>;

      case "RETURN_SUPPLIER":
        return <Tag color="red">Trả NCC</Tag>;

      case "SALE_OUT":
        return <Tag color="purple">Bán thuốc</Tag>;

      case "CUSTOMER_RETURN":
        return <Tag color="cyan">Hoàn khách hàng</Tag>;

      default:
        return <Tag>{type || "-"}</Tag>;
    }
  };

  /* =========================
     RECEIPT COLUMNS
  ========================= */

  const receiptColumns = [
    {
      title: "Mã phiếu",
      dataIndex: "receipt_code",
      key: "receipt_code",

      render: (value: string) => <Text strong>{value}</Text>,
    },

    {
      title: "Nhà cung cấp",
      key: "supplier",

      render: (_: unknown, record: PurchaseReceipt) =>
        record.supplier?.name || "-",
    },

    {
      title: "Hóa đơn",
      dataIndex: "invoice_number",
      key: "invoice_number",
    },

    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",

      render: (status: string) => renderStatus(status),
    },
  ];

  /* =========================
     MOVEMENT COLUMNS
  ========================= */

  const movementColumns = [
    {
      title: "Chứng từ",
      key: "reference_code",

      render: (_: unknown, record: StockMovement) => (
        <Text strong>{record.reference_code || "-"}</Text>
      ),
    },

    {
      title: "Thuốc",
      key: "medicine",

      render: (_: unknown, record: StockMovement) =>
        record.medicine?.name || "-",
    },

    {
      title: "Kho",
      key: "warehouse",

      render: (_: unknown, record: StockMovement) =>
        record.warehouse?.name || "-",
    },

    {
      title: "Loại",
      dataIndex: "movement_type",
      key: "movement_type",

      render: (type: string) => renderMovementType(type),
    },

    {
      title: "SL",
      key: "quantity",

      render: (_: unknown, record: StockMovement) => {
        const quantity = Number(record.signed_quantity);

        const isIn = quantity >= 0;

        return (
          <Text strong type={isIn ? "success" : "danger"}>
            {isIn ? `+${quantity}` : quantity}
          </Text>
        );
      },
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

  if (!canDashboard) {
    return (
      <Alert
        showIcon
        type="error"
        message="Bạn không có quyền xem Dashboard"
        description="Tài khoản cần quyền DASHBOARD_VIEW để truy cập trang này."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          marginBottom: 24,
        }}
      >
        <Title
          level={3}
          style={{
            marginBottom: 4,
          }}
        >
          Dashboard
        </Title>

        <Text type="secondary">Tổng quan hoạt động kho thuốc</Text>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{
            marginBottom: 20,
          }}
        />
      )}

      {/* =====================
          STATISTICS
      ====================== */}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title="Tổng số thuốc"
              value={medicineCount}
              prefix={<MedicineBoxOutlined />}
            />
          </Card>
        </Col>

        {canSupplierView && (
          <Col xs={24} sm={12} xl={6}>
            <Card loading={loading}>
              <Statistic
                title="Nhà cung cấp"
                value={supplierCount}
                prefix={<TruckOutlined />}
              />
            </Card>
          </Col>
        )}

        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title="Tồn Kho chính"
              value={mainWarehouseQuantity}
              suffix="đơn vị"
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title="Tồn Kho bán"
              value={saleWarehouseQuantity}
              suffix="đơn vị"
              prefix={<ShopOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* =====================
          TABLES
      ====================== */}

      <Row
        gutter={[16, 16]}
        style={{
          marginTop: 20,
        }}
      >
        {canPurchaseView && (
          <Col xs={24} xl={12}>
            <Card title="Phiếu nhập gần đây">
              <Table
                rowKey="id"
                columns={receiptColumns}
                dataSource={receipts}
                loading={loading}
                pagination={false}
                size="middle"
              />
            </Card>
          </Col>
        )}

        {canStockHistoryView && (
          <Col
            xs={24}
            xl={canPurchaseView ? 12 : 24}
          >
            <Card title="Biến động kho gần đây">
              <Table
                rowKey="id"
                columns={movementColumns}
                dataSource={movements}
                loading={loading}
                pagination={false}
                size="middle"
                scroll={{
                  x: 600,
                }}
              />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}

export default Dashboard;
