import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";

import {
  CheckCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================================================
   TYPES
========================================================= */

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

  medicine?: {
    id?: number;
    medicine_code?: string;
    name?: string;
    strength?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  };
}

interface WarehouseTransfer {
  id: number;
  transfer_code?: string | null;

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

  status?: string | null;
  note?: string | null;

  item_count?: number | string;
  total_quantity?: number | string;

  created_by?: UserInfo | null;
  created_at?: string | null;
  submitted_at?: string | null;

  items?: TransferItem[];
}

interface ReturnFormValues {
  reason: string;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeTransfers(data: unknown): WarehouseTransfer[] {
  if (Array.isArray(data)) {
    return data as WarehouseTransfer[];
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const value = data as Record<string, unknown>;

  for (const key of ["data", "transfers", "warehouse_transfers"]) {
    if (Array.isArray(value[key])) {
      return value[key] as WarehouseTransfer[];
    }
  }

  return [];
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

function WarehouseTransferApproval() {
  const navigate = useNavigate();

  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [selectedTransfer, setSelectedTransfer] =
    useState<WarehouseTransfer | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [approvingId, setApprovingId] = useState<number | null>(null);

  const [approvedTransfer, setApprovedTransfer] =
    useState<WarehouseTransfer | null>(null);

  const [rejectForm] = Form.useForm<ReturnFormValues>();
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);

  /* =========================================================
     LOAD
  ========================================================= */

  const loadPendingTransfers = async (keyword = search) => {
    try {
      setListLoading(true);

      const response = await api.get("/warehouse-transfers/pending", {
        params: {
          search: keyword.trim() || undefined,
        },
      });

      if (response.data?.success !== true) {
        message.error(
          response.data?.message || "Không thể tải phiếu chờ duyệt",
        );
        setTransfers([]);
        return;
      }

      setTransfers(normalizeTransfers(response.data));
    } catch (error) {
      console.error("Load pending warehouse transfers:", error);
      message.error("Không thể tải danh sách phiếu chuyển kho chờ duyệt");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadPendingTransfers("");
  }, []);

  /* =========================================================
     DETAIL
  ========================================================= */

  const handleViewDetail = async (transferId: number) => {
    try {
      setDrawerOpen(true);
      setDetailLoading(true);

      const response = await api.get(`/warehouse-transfers/${transferId}`);
      const data = response.data;

      if (data?.success !== true) {
        message.error(data?.message || "Không thể tải chi tiết phiếu");
        setDrawerOpen(false);
        return;
      }

      const transfer = (data.warehouse_transfer ||
        data.transfer ||
        data.data) as WarehouseTransfer | undefined;

      if (!transfer) {
        message.error("Không tìm thấy phiếu chuyển kho");
        setDrawerOpen(false);
        return;
      }

      setSelectedTransfer({
        ...transfer,
        items: Array.isArray(data.items)
          ? (data.items as TransferItem[])
          : Array.isArray(transfer.items)
            ? transfer.items
            : [],
        item_count:
          data.item_count ??
          (Array.isArray(data.items) ? data.items.length : 0),
        total_quantity:
          data.total_quantity ??
          (Array.isArray(data.items)
            ? data.items.reduce(
                (sum: number, item: TransferItem) =>
                  sum + Number(item.quantity || 0),
                0,
              )
            : 0),
      });
    } catch (error) {
      console.error("Warehouse transfer detail:", error);
      message.error("Không thể tải chi tiết phiếu chuyển kho");
      setDrawerOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  /* =========================================================
     APPROVE
  ========================================================= */

  const handleApprove = async (transferId: number) => {
    try {
      setApprovingId(transferId);

      let transferForCheck: WarehouseTransfer | null = null;

      try {
        const detailResponse = await api.get(
          `/warehouse-transfers/${transferId}`,
        );

        const detailData = detailResponse.data;

        if (detailData?.success === true) {
          const transfer = (detailData.warehouse_transfer ||
            detailData.transfer ||
            detailData.data) as WarehouseTransfer | undefined;

          if (transfer) {
            transferForCheck = {
              ...transfer,
              items: Array.isArray(detailData.items)
                ? (detailData.items as TransferItem[])
                : Array.isArray(transfer.items)
                  ? transfer.items
                  : [],
            };
          }
        }
      } catch (detailError) {
        console.error(
          "Load transfer before approval:",
          detailError,
        );
      }

      const response = await api.post(
        `/warehouse-transfers/${transferId}/approve`,
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message ||
            "Không thể duyệt phiếu chuyển kho",
        );
        return;
      }

      if (transferForCheck) {
        setApprovedTransfer(transferForCheck);
      } else {
        message.success(
          "Duyệt chuyển kho thành công. Tồn kho đã được cập nhật.",
        );
      }

      if (selectedTransfer?.id === transferId) {
        setDrawerOpen(false);
        setSelectedTransfer(null);
      }

      await loadPendingTransfers();
    } catch (error) {
      console.error("Approve warehouse transfer:", error);
      message.error("Có lỗi khi duyệt phiếu chuyển kho");
    } finally {
      setApprovingId(null);
    }
  };

  /* =========================================================
     REJECT TO EDIT
  ========================================================= */

  const openRejectModal = (transferId: number) => {
    setRejectingId(transferId);
    rejectForm.resetFields();
    setRejectModalOpen(true);
  };

  const closeRejectModal = () => {
    if (rejecting) {
      return;
    }

    setRejectModalOpen(false);
    setRejectingId(null);
    rejectForm.resetFields();
  };

  const handleReject = async (values: ReturnFormValues) => {
    if (!rejectingId) {
      return;
    }

    const reason = values.reason?.trim();

    if (!reason) {
      message.warning("Vui lòng nhập lý do cần chỉnh sửa");
      return;
    }

    try {
      setRejecting(true);

      const response = await api.post(
        `/warehouse-transfers/${rejectingId}/reject`,
        {
          reason,
        },
      );

      if (response.data?.success !== true) {
        message.error(
          response.data?.message || "Không thể trả phiếu về chỉnh sửa",
        );
        return;
      }

      message.success("Phiếu đã trở về trạng thái Cần chỉnh sửa");

      if (selectedTransfer?.id === rejectingId) {
        setDrawerOpen(false);
        setSelectedTransfer(null);
      }

      setRejectModalOpen(false);
      setRejectingId(null);
      rejectForm.resetFields();

      await loadPendingTransfers();
    } catch (error) {
      console.error("Reject transfer to edit:", error);
      message.error("Có lỗi khi trả phiếu về chỉnh sửa");
    } finally {
      setRejecting(false);
    }
  };

  /* =========================================================
     TABLES
  ========================================================= */

  const itemColumns = [
    {
      title: "STT",
      width: 60,
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
      width: 220,
      render: (_: unknown, item: TransferItem) => (
        <>
          <Text strong>{item.medicine?.name || "-"}</Text>

          {(item.medicine?.strength || item.medicine?.dosage_form) && (
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
      width: 130,
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
      key: "source_available_quantity",
      width: 140,
      render: (_: unknown, item: TransferItem) =>
        `${Number(item.source_available_quantity || 0)} ${
          item.medicine?.unit || ""
        }`,
    },
  ];

  const columns = [
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
      title: "Kho nguồn",
      key: "source",
      width: 180,
      render: (_: unknown, record: WarehouseTransfer) =>
        record.source_warehouse?.name || "-",
    },
    {
      title: "Kho đích",
      key: "destination",
      width: 180,
      render: (_: unknown, record: WarehouseTransfer) =>
        record.destination_warehouse?.name || "-",
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
      title: "Người tạo",
      key: "created_by",
      width: 170,
      render: (_: unknown, record: WarehouseTransfer) =>
        getUserLabel(record.created_by),
    },
    {
      title: "Ngày gửi",
      dataIndex: "submitted_at",
      key: "submitted_at",
      width: 165,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 120,
      render: () => <Tag color="orange">Chờ duyệt</Tag>,
    },
    {
      title: "Thao tác",
      key: "actions",
      fixed: "right" as const,
      width: 450,
      render: (_: unknown, record: WarehouseTransfer) => (
        <Space wrap>
          <Button
            icon={<EyeOutlined />}
            onClick={() => void handleViewDetail(record.id)}
          >
            Chi tiết
          </Button>

          <Popconfirm
            title="Duyệt phiếu chuyển kho?"
            description="Sau khi duyệt, kho nguồn sẽ bị trừ và kho đích sẽ được cộng tồn."
            okText="Duyệt"
            cancelText="Hủy"
            onConfirm={() => void handleApprove(record.id)}
          >
            <Button
              type="primary"
              loading={approvingId === record.id}
              icon={<CheckCircleOutlined />}
            >
              Duyệt
            </Button>
          </Popconfirm>

          <Button
            danger
            icon={<StopOutlined />}
            onClick={() => openRejectModal(record.id)}
          >
            Từ chối để chỉnh sửa
          </Button>
        </Space>
      ),
    },
  ];

  /* =========================================================
     UI
  ========================================================= */

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
          <Title level={3} style={{ marginBottom: 4 }}>
            Duyệt chuyển kho
          </Title>

          <Text type="secondary">
            Kiểm tra và xử lý các phiếu chuyển kho đang chờ duyệt.
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined />}
          loading={listLoading}
          onClick={() => void loadPendingTransfers()}
        >
          Làm mới
        </Button>
      </div>

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="Quy tắc duyệt chuyển kho"
        description="Phiếu đang chờ duyệt chưa làm thay đổi tồn kho. Chỉ khi bấm Duyệt, hệ thống mới trừ kho nguồn, cộng kho đích và ghi TRANSFER_OUT / TRANSFER_IN. Trả về chỉ đổi trạng thái sang Cần chỉnh sửa."
      />

      <Card
        title={`Phiếu chờ duyệt (${transfers.length})`}
        extra={
          <Space>
            <Input
              allowClear
              value={search}
              prefix={<SearchOutlined />}
              placeholder="Tìm mã phiếu, kho, người tạo..."
              style={{ width: 280 }}
              onChange={(event) => setSearch(event.target.value)}
              onPressEnter={() => void loadPendingTransfers()}
            />

            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => void loadPendingTransfers()}
            >
              Tìm
            </Button>
          </Space>
        }
      >
        {transfers.length === 0 && !listLoading ? (
          <Empty description="Không có phiếu chuyển kho nào đang chờ duyệt" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={transfers}
            loading={listLoading}
            scroll={{ x: 1500 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `Tổng ${total} phiếu`,
            }}
          />
        )}
      </Card>

      {/* DETAIL */}

      <Drawer
        title={
          selectedTransfer
            ? `Chi tiết ${
                selectedTransfer.transfer_code || `#${selectedTransfer.id}`
              }`
            : "Chi tiết phiếu chuyển kho"
        }
        width={860}
        open={drawerOpen}
        loading={detailLoading}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setSelectedTransfer(null);
        }}
        extra={
          selectedTransfer ? (
            <Space>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => openRejectModal(selectedTransfer.id)}
              >
                Từ chối để chỉnh sửa
              </Button>

              <Popconfirm
                title="Duyệt phiếu chuyển kho?"
                description="Tồn kho sẽ được cập nhật ngay sau khi duyệt."
                okText="Duyệt"
                cancelText="Hủy"
                onConfirm={() => void handleApprove(selectedTransfer.id)}
              >
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={approvingId === selectedTransfer.id}
                >
                  Duyệt chuyển kho
                </Button>
              </Popconfirm>
            </Space>
          ) : null
        }
      >
        {selectedTransfer && (
          <>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Mã phiếu">
                {selectedTransfer.transfer_code || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Trạng thái">
                <Tag color="orange">Chờ duyệt</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Kho nguồn">
                {selectedTransfer.source_warehouse?.warehouse_code
                  ? `${selectedTransfer.source_warehouse.warehouse_code} - `
                  : ""}
                {selectedTransfer.source_warehouse?.name || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Kho đích">
                {selectedTransfer.destination_warehouse?.warehouse_code
                  ? `${selectedTransfer.destination_warehouse.warehouse_code} - `
                  : ""}
                {selectedTransfer.destination_warehouse?.name || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Người tạo">
                {getUserLabel(selectedTransfer.created_by)}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày tạo">
                {formatDateTime(selectedTransfer.created_at)}
              </Descriptions.Item>

              <Descriptions.Item label="Ngày gửi duyệt">
                {formatDateTime(selectedTransfer.submitted_at)}
              </Descriptions.Item>

              <Descriptions.Item label="Ghi chú">
                {selectedTransfer.note || "-"}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 24 }}>
              Thuốc/lô trong phiếu
            </Title>

            <Table
              rowKey="id"
              columns={itemColumns}
              dataSource={selectedTransfer.items || []}
              pagination={false}
              scroll={{ x: 980 }}
            />
          </>
        )}
      </Drawer>

      {/* RETURN MODAL */}

      <Modal
        title="Chuyển kho thành công"
        open={approvedTransfer !== null}
        footer={null}
        centered
        width={760}
        onCancel={() => setApprovedTransfer(null)}
      >
        {approvedTransfer && (
          <>
            <Alert
              showIcon
              type="success"
              style={{ marginBottom: 16 }}
              message={`Đã duyệt ${
                approvedTransfer.transfer_code ||
                `phiếu #${approvedTransfer.id}`
              }`}
              description={`Tồn kho đã được cập nhật: ${
                approvedTransfer.source_warehouse?.name || "Kho nguồn"
              } → ${
                approvedTransfer.destination_warehouse?.name || "Kho đích"
              }.`}
            />

            <Table<TransferItem>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={approvedTransfer.items || []}
              columns={[
                {
                  title: "ID lô",
                  key: "batch_id",
                  width: 90,
                  render: (_: unknown, item: TransferItem) =>
                    item.batch_id ? <Tag>#{item.batch_id}</Tag> : "-",
                },
                {
                  title: "Thuốc",
                  key: "medicine",
                  render: (_: unknown, item: TransferItem) => (
                    <div>
                      <Text strong>
                        {item.medicine?.medicine_code || "-"} -{" "}
                        {item.medicine?.name || "-"}
                      </Text>
                      <br />
                      <Text type="secondary">
                        Lô {item.lot_number || "-"}
                      </Text>
                    </div>
                  ),
                },
                {
                  title: "SL chuyển",
                  key: "quantity",
                  width: 120,
                  render: (_: unknown, item: TransferItem) =>
                    `${Number(item.quantity || 0)} ${
                      item.medicine?.unit || ""
                    }`,
                },
                {
                  title: "Kiểm tra",
                  key: "inventory",
                  width: 150,
                  render: (_: unknown, item: TransferItem) => (
                    <Button
                      type="link"
                      disabled={!item.batch_id}
                      onClick={() => {
                        if (!item.batch_id) {
                          return;
                        }

                        setApprovedTransfer(null);

                        navigate(
                          `/inventory?batch_id=${item.batch_id}`,
                        );
                      }}
                    >
                      Xem tồn kho
                    </Button>
                  ),
                },
              ]}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <Button
                onClick={() => setApprovedTransfer(null)}
              >
                Đóng
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* REJECT MODAL */}

      <Modal
        title="Từ chối để chỉnh sửa"
        open={rejectModalOpen}
        onCancel={closeRejectModal}
        footer={null}
        destroyOnHidden
      >
        <Alert
          showIcon
          type="warning"
          message="Phiếu sẽ trở về trạng thái Cần chỉnh sửa"
          description="Sau khi từ chối, người tạo có thể mở lại phiếu, sửa thông tin hoặc thuốc rồi gửi duyệt lại. Số lượng đã dự trù vẫn được giữ."
          style={{ marginBottom: 16 }}
        />

        <Form
          form={rejectForm}
          layout="vertical"
          requiredMark={false}
          onFinish={handleReject}
        >
          <Form.Item
            label="Lý do cần chỉnh sửa"
            name="reason"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "Vui lòng nhập lý do cần chỉnh sửa",
              },
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={500}
              showCount
              placeholder="Ví dụ: Kiểm tra lại số lượng hoặc chọn nhầm lô thuốc..."
            />
          </Form.Item>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <Button disabled={rejecting} onClick={closeRejectModal}>
              Hủy
            </Button>

            <Button
              danger
              type="primary"
              htmlType="submit"
              loading={rejecting}
              icon={<StopOutlined />}
            >
              Từ chối để chỉnh sửa
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default WarehouseTransferApproval;
