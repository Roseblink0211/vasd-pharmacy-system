import { useState } from "react";

import axios from "axios";

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  message,
  Space,
  Typography,
} from "antd";

import {
  ArrowLeftOutlined,
  LockOutlined,
  MailOutlined,
  MedicineBoxOutlined,
  PhoneOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { useNavigate } from "react-router-dom";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================
   TYPES
========================= */

interface RegisterFormValues {
  full_name: string;

  email: string;

  phone?: string;

  address?: string;

  password: string;

  confirm_password: string;
}

/* =========================
   HELPERS
========================= */

function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;

    if (typeof data === "object" && data !== null) {
      const responseData = data as {
        detail?: string;
        message?: string;
      };

      return responseData.detail || responseData.message || fallback;
    }
  }

  return fallback;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    return false;
  }

  if (/\s/.test(password)) {
    return false;
  }

  if (!/[A-Za-z]/.test(password)) {
    return false;
  }

  if (!/[0-9]/.test(password)) {
    return false;
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return false;
  }

  return true;
}

/* =========================
   COMPONENT
========================= */

function Register() {
  const navigate = useNavigate();

  const [form] = Form.useForm<RegisterFormValues>();

  const [registering, setRegistering] = useState(false);

  /* =========================
     REGISTER
  ========================= */

  const handleRegister = async (values: RegisterFormValues) => {
    const fullName = values.full_name.trim();

    const email = values.email.trim().toLowerCase();

    const phone = values.phone?.trim() || null;

    const address = values.address?.trim() || null;

    if (!fullName) {
      message.warning("Vui lòng nhập họ và tên");

      return;
    }

    if (values.password !== values.confirm_password) {
      message.warning("Xác nhận mật khẩu không khớp");

      return;
    }

    if (!validatePassword(values.password)) {
      message.warning(
        "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ, số, ký tự đặc biệt và không chứa khoảng trắng",
      );

      return;
    }

    try {
      setRegistering(true);

      const response = await api.post("/users/register", {
        full_name: fullName,

        email,

        password: values.password,

        phone,

        address,
      });

      const data = response.data;

      if (data.success === false) {
        message.error(data.message || "Đăng ký tài khoản thất bại");

        return;
      }

      message.success(data.message || "Đăng ký tài khoản thành công");

      form.resetFields();

      navigate("/login", {
        replace: true,

        state: {
          registeredEmail: email,
        },
      });
    } catch (error) {
      console.error("Register:", error);

      message.error(getApiErrorMessage(error, "Không thể đăng ký tài khoản"));
    } finally {
      setRegistering(false);
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div
      style={{
        minHeight: "100vh",

        display: "flex",

        alignItems: "center",

        justifyContent: "center",

        padding: 24,

        background: "#f5f7fa",
      }}
    >
      <Card
        style={{
          width: "100%",

          maxWidth: 520,

          borderRadius: 16,

          boxShadow: "0 12px 40px rgba(15, 23, 42, 0.08)",
        }}
      >
        {/* BRAND */}

        <div
          style={{
            textAlign: "center",

            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,

              height: 64,

              borderRadius: 16,

              margin: "0 auto 14px",

              display: "flex",

              alignItems: "center",

              justifyContent: "center",

              background: "#1677ff",

              color: "#ffffff",

              fontSize: 28,
            }}
          >
            <MedicineBoxOutlined />
          </div>

          <Title
            level={3}
            style={{
              marginBottom: 4,
            }}
          >
            Đăng ký tài khoản
          </Title>

          <Text type="secondary">VASD Pharmacy</Text>
        </div>

        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 20,
          }}
          message="Yêu cầu mật khẩu"
          description="Ít nhất 8 ký tự, có chữ, số, ký tự đặc biệt và không chứa khoảng trắng."
        />

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleRegister}
        >
          {/* FULL NAME */}

          <Form.Item
            label="Họ và tên"
            name="full_name"
            rules={[
              {
                required: true,

                message: "Vui lòng nhập họ và tên",
              },

              {
                whitespace: true,

                message: "Họ và tên không được để trống",
              },
            ]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="Ví dụ: Nguyễn Văn A"
              autoComplete="name"
            />
          </Form.Item>

          {/* EMAIL */}

          <Form.Item
            label="Email"
            name="email"
            rules={[
              {
                required: true,

                message: "Vui lòng nhập email",
              },

              {
                type: "email",

                message: "Email không hợp lệ",
              },
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined />}
              placeholder="example@gmail.com"
              autoComplete="email"
            />
          </Form.Item>

          {/* PHONE */}

          <Form.Item label="Số điện thoại" name="phone">
            <Input
              size="large"
              prefix={<PhoneOutlined />}
              placeholder="Nhập số điện thoại"
              maxLength={20}
              autoComplete="tel"
            />
          </Form.Item>

          {/* ADDRESS */}

          <Form.Item label="Địa chỉ" name="address">
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder="Nhập địa chỉ"
            />
          </Form.Item>

          {/* PASSWORD */}

          <Form.Item
            label="Mật khẩu"
            name="password"
            rules={[
              {
                required: true,

                message: "Vui lòng nhập mật khẩu",
              },

              {
                validator: (_, value) => {
                  if (!value) {
                    return Promise.resolve();
                  }

                  if (!validatePassword(value)) {
                    return Promise.reject(
                      new Error(
                        "Ít nhất 8 ký tự, có chữ, số, ký tự đặc biệt và không có khoảng trắng",
                      ),
                    );
                  }

                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="Nhập mật khẩu"
              autoComplete="new-password"
            />
          </Form.Item>

          {/* CONFIRM PASSWORD */}

          <Form.Item
            label="Xác nhận mật khẩu"
            name="confirm_password"
            dependencies={["password"]}
            rules={[
              {
                required: true,

                message: "Vui lòng xác nhận mật khẩu",
              },

              ({ getFieldValue }) => ({
                validator: (_, value) => {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }

                  return Promise.reject(
                    new Error("Xác nhận mật khẩu không khớp"),
                  );
                },
              }),
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
            />
          </Form.Item>

          {/* REGISTER */}

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={registering}
          >
            Đăng ký tài khoản
          </Button>

          {/* LOGIN */}

          <div
            style={{
              textAlign: "center",

              marginTop: 20,
            }}
          >
            <Space size={4}>
              <Text type="secondary">Đã có tài khoản?</Text>

              <Button
                type="link"
                style={{
                  padding: 0,
                }}
                onClick={() => navigate("/login")}
              >
                Đăng nhập ngay
              </Button>
            </Space>
          </div>

          <div
            style={{
              textAlign: "center",

              marginTop: 8,
            }}
          >
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/login")}
            >
              Quay lại đăng nhập
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}

export default Register;
