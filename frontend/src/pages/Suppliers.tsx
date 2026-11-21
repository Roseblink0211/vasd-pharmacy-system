import { useEffect, useState } from "react";

import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";

import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import type { TableColumnsType } from "antd";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================================================
   TYPES
========================================================= */

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;

  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_code?: string | null;
  contact_person?: string | null;
  note?: string | null;

  is_active: boolean;

  created_at?: string | null;
  updated_at?: string | null;
}

interface SupplierFormValues {
  name: string;

  address?: string;
  phone?: string;
  email?: string;
  tax_code?: string;
  contact_person?: string;
  note?: string;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeSuppliers(data: unknown): Supplier[] {
  if (typeof data !== "object" || data === null) {
    return [];
  }

  const value = data as Record<string, unknown>;

  if (Array.isArray(value.data)) {
    return value.data as Supplier[];
  }

  if (Array.isArray(value.suppliers)) {
    return value.suppliers as Supplier[];
  }

  return [];
}

/* =========================================================
   COMPONENT
========================================================= */

function Suppliers() {
  const [form] = Form.useForm<SupplierFormValues>();

  /* =========================
     DATA
  ========================= */

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [loading, setLoading] = useState(true);

  /* =========================
     FILTER
  ========================= */

  const [searchText, setSearchText] = useState("");

  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(
    undefined,
  );

  /* =========================
     MODAL
  ========================= */

  const [modalOpen, setModalOpen] = useState(false);

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [saving, setSaving] = useState(false);

  /* =========================
     PAGINATION
  ========================= */

  const [currentPage, setCurrentPage] = useState(1);

  const [pageSize, setPageSize] = useState(10);

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadInitialSuppliers = async () => {
      try {
        const response = await api.get("/suppliers");

        if (cancelled) {
          return;
        }

        const data = response.data;

        if (data.success !== true) {
          message.error(data.message || "Không thể tải danh sách nhà cung cấp");

          return;
        }

        setSuppliers(normalizeSuppliers(data));
      } catch (error) {
        console.error("Load initial suppliers:", error);

        if (!cancelled) {
          message.error("Có lỗi khi tải danh sách nhà cung cấp");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialSuppliers();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     LOAD DATA
  ========================================================= */

  const loadSuppliers = async (
    search = searchText,
    isActive = statusFilter,
  ) => {
    try {
      setLoading(true);

      const response = await api.get("/suppliers", {
        params: {
          search: search.trim() || undefined,
          is_active: isActive,
        },
      });

      const data = response.data;

      if (data.success !== true) {
        message.error(data.message || "Không thể tải danh sách nhà cung cấp");

        return;
      }

      setSuppliers(normalizeSuppliers(data));
    } catch (error) {
      console.error("Load suppliers:", error);

      message.error("Có lỗi khi tải danh sách nhà cung cấp");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     SEARCH
  ========================================================= */

  const handleSearch = async () => {
    setCurrentPage(1);

    await loadSuppliers();
  };

  const handleReset = async () => {
    setSearchText("");

    setStatusFilter(undefined);

    setCurrentPage(1);

    await loadSuppliers("", undefined);
  };

  /* =========================================================
     CREATE
  ========================================================= */

  const handleOpenCreate = () => {
    setEditingSupplier(null);

    form.resetFields();

    setModalOpen(true);
  };

  /* =========================================================
     EDIT
  ========================================================= */

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);

    form.setFieldsValue({
      name: supplier.name,

      address: supplier.address || "",

      phone: supplier.phone || "",

      email: supplier.email || "",

      tax_code: supplier.tax_code || "",

      contact_person: supplier.contact_person || "",

      note: supplier.note || "",
    });

    setModalOpen(true);
  };

  /* =========================================================
     SAVE
  ========================================================= */

  const handleSave = async (values: SupplierFormValues) => {
    const payload = {
      name: values.name.trim(),

      address: values.address?.trim() || null,

      phone: values.phone?.trim() || null,

      email: values.email?.trim() || null,

      tax_code: values.tax_code?.trim() || null,

      contact_person: values.contact_person?.trim() || null,

      note: values.note?.trim() || null,
    };

    try {
      setSaving(true);

      const response = editingSupplier
        ? await api.put(`/suppliers/${editingSupplier.id}`, payload)
        : await api.post("/suppliers", payload);

      const data = response.data;

      if (data.success !== true) {
        message.error(
          data.message ||
            (editingSupplier
              ? "Cập nhật nhà cung cấp thất bại"
              : "Thêm nhà cung cấp thất bại"),
        );

        return;
      }

      message.success(
        data.message ||
          (editingSupplier
            ? "Cập nhật nhà cung cấp thành công"
            : "Thêm nhà cung cấp thành công"),
      );

      setModalOpen(false);

      setEditingSupplier(null);

      form.resetFields();

      await loadSuppliers();
    } catch (error) {
      console.error("Save supplier:", error);

      message.error(
        editingSupplier
          ? "Có lỗi khi cập nhật nhà cung cấp"
          : "Có lỗi khi thêm nhà cung cấp",
      );
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     STATUS
  ========================================================= */

  const handleChangeStatus = async (supplier: Supplier) => {
    const newStatus = !supplier.is_active;

    try {
      const response = await api.patch(`/suppliers/${supplier.id}/status`, {
        is_active: newStatus,
      });

      const data = response.data;

      if (data.success !== true) {
        message.error(
          data.message || "Không thể cập nhật trạng thái nhà cung cấp",
        );

        return;
      }

      message.success(
        data.message ||
          (newStatus
            ? "Đã kích hoạt nhà cung cấp"
            : "Đã ngừng hoạt động nhà cung cấp"),
      );

      await loadSuppliers();
    } catch (error) {
      console.error("Change supplier status:", error);

      message.error("Có lỗi khi cập nhật trạng thái nhà cung cấp");
    }
  };

  /* =========================================================
     TABLE COLUMNS
  ========================================================= */

  const columns: TableColumnsType<Supplier> = [
    {
      title: "STT",

      key: "stt",

      width: 60,

      align: "center",

      fixed: "left",

      render: (_value, _record, index) =>
        (currentPage - 1) * pageSize + index + 1,
    },

    {
      title: "Mã NCC",

      dataIndex: "supplier_code",

      key: "supplier_code",

      width: 120,

      fixed: "left",

      render: (value: string) => <Text strong>{value || "-"}</Text>,
    },

    {
      title: "Tên nhà cung cấp",

      dataIndex: "name",

      key: "name",

      width: 220,

      ellipsis: true,

      render: (value: string) => (
        <Text
          title={value || ""}
          style={{
            display: "block",
            maxWidth: 200,
          }}
          ellipsis
        >
          {value || "-"}
        </Text>
      ),
    },

    {
      title: "Số điện thoại",

      dataIndex: "phone",

      key: "phone",

      width: 130,

      render: (value: string | null) => value || "-",
    },

    {
      title: "Email",

      dataIndex: "email",

      key: "email",

      width: 190,

      ellipsis: true,

      render: (value: string | null) => (
        <Text
          title={value || ""}
          style={{
            display: "block",
            maxWidth: 170,
          }}
          ellipsis
        >
          {value || "-"}
        </Text>
      ),
    },

    {
      title: "Mã số thuế",

      dataIndex: "tax_code",

      key: "tax_code",

      width: 130,

      render: (value: string | null) => value || "-",
    },

    {
      title: "Người liên hệ",

      dataIndex: "contact_person",

      key: "contact_person",

      width: 140,

      ellipsis: true,

      render: (value: string | null) => (
        <Text
          title={value || ""}
          style={{
            display: "block",
            maxWidth: 120,
          }}
          ellipsis
        >
          {value || "-"}
        </Text>
      ),
    },

    {
      title: "Trạng thái",

      dataIndex: "is_active",

      key: "is_active",

      width: 110,

      align: "center",

      render: (value: boolean) =>
        value ? (
          <Tag color="green">Hoạt động</Tag>
        ) : (
          <Tag color="red">Ngừng</Tag>
        ),
    },

    {
      title: "Thao tác",

      key: "actions",

      width: 165,

      fixed: "right",

      align: "center",

      render: (_value, record) => (
        <Space size={8}>
          <Button
            type="link"
            icon={<EditOutlined />}
            style={{
              padding: 0,
            }}
            onClick={() => handleOpenEdit(record)}
          >
            Sửa
          </Button>

          <Popconfirm
            title={
              record.is_active
                ? "Ngừng nhà cung cấp?"
                : "Kích hoạt nhà cung cấp?"
            }
            description={
              record.is_active
                ? "Nhà cung cấp sẽ không được sử dụng cho các nghiệp vụ mới."
                : "Nhà cung cấp sẽ được kích hoạt trở lại."
            }
            okText={record.is_active ? "Ngừng" : "Kích hoạt"}
            cancelText="Hủy"
            okButtonProps={{
              danger: record.is_active,
            }}
            onConfirm={() => void handleChangeStatus(record)}
          >
            <Button
              type="link"
              danger={record.is_active}
              icon={
                record.is_active ? <StopOutlined /> : <CheckCircleOutlined />
              }
              style={{
                padding: 0,

                color: record.is_active ? undefined : "#52c41a",
              }}
            >
              {record.is_active ? "Ngừng" : "Kích hoạt"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
      }}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

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
            Nhà cung cấp
          </Title>

          <Text type="secondary">Quản lý danh mục nhà cung cấp thuốc</Text>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenCreate}
        >
          Thêm nhà cung cấp
        </Button>
      </div>

      {/* =====================================================
          FILTER
      ===================================================== */}

      <Card
        style={{
          marginBottom: 24,
          width: "100%",
        }}
      >
        <Space
          wrap
          size={12}
          style={{
            width: "100%",
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm mã, tên, SĐT, MST..."
            value={searchText}
            style={{
              width: 300,
            }}
            onChange={(event) => setSearchText(event.target.value)}
            onPressEnter={() => void handleSearch()}
          />

          <Select
            allowClear
            placeholder="Trạng thái"
            value={statusFilter}
            style={{
              width: 170,
            }}
            options={[
              {
                value: true,
                label: "Hoạt động",
              },

              {
                value: false,
                label: "Ngừng hoạt động",
              },
            ]}
            onChange={(value) => setStatusFilter(value)}
          />

          <Button icon={<SearchOutlined />} onClick={() => void handleSearch()}>
            Tìm kiếm
          </Button>

          <Button icon={<ReloadOutlined />} onClick={() => void handleReset()}>
            Làm mới
          </Button>
        </Space>
      </Card>

      {/* =====================================================
          TABLE
      ===================================================== */}

      <Card
        styles={{
          body: {
            padding: 20,
            overflow: "hidden",
          },
        }}
      >
        <div
          style={{
            width: "100%",
            overflowX: "auto",
          }}
        >
          <Table<Supplier>
            rowKey="id"
            columns={columns}
            dataSource={suppliers}
            loading={loading}
            size="middle"
            tableLayout="fixed"
            scroll={{
              x: 1265,
            }}
            pagination={{
              current: currentPage,

              pageSize,

              showSizeChanger: true,

              pageSizeOptions: [10, 20, 50],

              showQuickJumper: false,

              showTotal: (total) => `Tổng ${total} nhà cung cấp`,

              onChange: (page, size) => {
                setCurrentPage(page);

                setPageSize(size);
              },
            }}
          />
        </div>
      </Card>

      {/* =====================================================
          CREATE / EDIT MODAL
      ===================================================== */}

      <Modal
        title={
          editingSupplier
            ? `Sửa nhà cung cấp ${editingSupplier.supplier_code || ""}`
            : "Thêm nhà cung cấp"
        }
        open={modalOpen}
        width={760}
        centered
        okText={editingSupplier ? "Cập nhật" : "Thêm"}
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnHidden
        styles={{
          body: {
            maxHeight: "68vh",
            overflowY: "auto",
            paddingRight: 6,
          },
        }}
        onOk={() => form.submit()}
        onCancel={() => {
          if (saving) {
            return;
          }

          setModalOpen(false);

          setEditingSupplier(null);

          form.resetFields();
        }}
      >
        <Form<SupplierFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSave}
        >
          {/* TÊN NHÀ CUNG CẤP */}

          <Form.Item
            label="Tên nhà cung cấp"
            name="name"
            rules={[
              {
                required: true,

                whitespace: true,

                message: "Vui lòng nhập tên nhà cung cấp",
              },
            ]}
          >
            <Input
              maxLength={255}
              placeholder="Ví dụ: Công ty Cổ phần Dược Hậu Giang"
            />
          </Form.Item>

          {/* ĐỊA CHỈ */}

          <Form.Item label="Địa chỉ" name="address">
            <Input maxLength={500} placeholder="Nhập địa chỉ" />
          </Form.Item>

          {/* PHONE + EMAIL */}

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Số điện thoại" name="phone">
                <Input maxLength={20} placeholder="Ví dụ: 02923891433" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Email"
                name="email"
                rules={[
                  {
                    type: "email",

                    message: "Email không đúng định dạng",
                  },
                ]}
              >
                <Input maxLength={255} placeholder="Ví dụ: info@company.com" />
              </Form.Item>
            </Col>
          </Row>

          {/* TAX CODE + CONTACT */}

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Mã số thuế" name="tax_code">
                <Input maxLength={50} placeholder="Nhập mã số thuế" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Người liên hệ" name="contact_person">
                <Input
                  maxLength={255}
                  placeholder="Nhập người liên hệ nếu có"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* NOTE / SOURCE */}

          <Form.Item label="Ghi chú / Nguồn dữ liệu" name="note">
            <Input.TextArea
              rows={4}
              maxLength={1000}
              showCount
              placeholder="Ví dụ: Nguồn: Website chính thức của nhà cung cấp. Dữ liệu phục vụ demo hệ thống."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Suppliers;
