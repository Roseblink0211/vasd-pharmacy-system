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
  LockOutlined,
  LoginOutlined,
  MailOutlined,
  MedicineBoxOutlined,
  UserAddOutlined,
} from "@ant-design/icons";

import { useLocation, useNavigate } from "react-router-dom";

import api from "../api/api";

const { Title, Text } = Typography;

/* =========================
   TYPES
========================= */

interface LoginFormValues {
  email: string;
  password: string;
}

interface CurrentUser {
  id?: number;

  full_name?: string;

  email?: string;

  phone?: string | null;

  address?: string | null;

  is_active?: boolean;
}

interface LoginLocationState {
  registeredEmail?: string;
}

/* =========================
   ERROR MESSAGE
========================= */

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const data = error.response?.data;

  if (typeof data !== "object" || data === null) {
    return fallback;
  }

  const responseData = data as {
    detail?: unknown;
    message?: unknown;
  };

  if (typeof responseData.message === "string") {
    return responseData.message;
  }

  if (typeof responseData.detail === "string") {
    return responseData.detail;
  }

  /*
   * FastAPI validation error:
   *
   * {
   *   "detail": [
   *     {
   *       "msg": "..."
   *     }
   *   ]
   * }
   */

  if (Array.isArray(responseData.detail)) {
    const firstError = responseData.detail[0];

    if (
      typeof firstError === "object" &&
      firstError !== null &&
      "msg" in firstError
    ) {
      const msg = (
        firstError as {
          msg?: unknown;
        }
      ).msg;

      if (typeof msg === "string") {
        return msg;
      }
    }
  }

  return fallback;
}

/* =========================
   ACCESS TOKEN
========================= */

function getAccessToken(data: unknown) {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const response = data as {
    access_token?: unknown;

    token?: unknown;

    data?: {
      access_token?: unknown;
      token?: unknown;
    };

    auth?: {
      access_token?: unknown;
      token?: unknown;
    };
  };

  /*
   * Case:
   * {
   *   access_token: "..."
   * }
   */

  if (typeof response.access_token === "string" && response.access_token) {
    return response.access_token;
  }

  /*
   * Case:
   * {
   *   token: "..."
   * }
   */

  if (typeof response.token === "string" && response.token) {
    return response.token;
  }

  /*
   * Case:
   * {
   *   data: {
   *     access_token: "..."
   *   }
   * }
   */

  if (
    typeof response.data?.access_token === "string" &&
    response.data.access_token
  ) {
    return response.data.access_token;
  }

  if (typeof response.data?.token === "string" && response.data.token) {
    return response.data.token;
  }

  /*
   * Case:
   * {
   *   auth: {
   *     access_token: "..."
   *   }
   * }
   */

  if (
    typeof response.auth?.access_token === "string" &&
    response.auth.access_token
  ) {
    return response.auth.access_token;
  }

  if (typeof response.auth?.token === "string" && response.auth.token) {
    return response.auth.token;
  }

  return "";
}

/* =========================
   USER FROM LOGIN
========================= */

function getUserFromResponse(data: unknown): CurrentUser | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const response = data as {
    user?: unknown;

    data?: {
      user?: unknown;
    };
  };

  if (typeof response.user === "object" && response.user !== null) {
    return response.user as CurrentUser;
  }

  if (typeof response.data?.user === "object" && response.data.user !== null) {
    return response.data.user as CurrentUser;
  }

  return null;
}

/* =========================
   COMPONENT
========================= */

function Login() {
  const navigate = useNavigate();

  const location = useLocation();

  const [form] = Form.useForm<LoginFormValues>();

  const [loggingIn, setLoggingIn] = useState(false);

  /*
   * Khi Register.tsx đăng ký thành công:
   *
   * navigate("/login", {
   *   state: {
   *     registeredEmail: email
   *   }
   * })
   */

  const locationState = location.state as LoginLocationState | null;

  const registeredEmail = locationState?.registeredEmail || "";

  /* =========================
     LOGIN
  ========================= */

  const handleLogin = async (values: LoginFormValues) => {
    const email = values.email.trim().toLowerCase();

    const password = values.password;

    if (!email) {
      message.warning("Vui lòng nhập email");

      return;
    }

    if (!password) {
      message.warning("Vui lòng nhập mật khẩu");

      return;
    }

    try {
      setLoggingIn(true);

      /*
       * Xóa session/token cũ
       * trước khi login tài khoản mới.
       */

      localStorage.removeItem("access_token");

      localStorage.removeItem("user");

      /* =====================
           LOGIN API
        ====================== */

      const response = await api.post("/users/login", {
        email,
        password,
      });

      const data = response.data;

      /*
       * Backend có thể trả HTTP 200
       * nhưng success = false.
       */

      if (data?.success === false) {
        message.error(data.message || "Email hoặc mật khẩu không đúng");

        return;
      }

      /* =====================
           GET TOKEN
        ====================== */

      const accessToken = getAccessToken(data);

      if (!accessToken) {
        console.error("Login response không có token:", data);

        message.error("Không nhận được token đăng nhập từ máy chủ");

        return;
      }

      /*
       * api.ts sẽ lấy token này
       * để gửi Authorization:
       *
       * Bearer <token>
       */

      localStorage.setItem("access_token", accessToken);

      /* =====================
           GET USER
        ====================== */

      let currentUser = getUserFromResponse(data);

      /*
       * Dù login đã trả user hay chưa,
       * vẫn thử GET /users/me để lấy
       * thông tin mới nhất.
       */

      try {
        const profileResponse = await api.get("/users/me");

        const profileData = profileResponse.data;

        if (profileData?.success === true && profileData?.user) {
          currentUser = profileData.user as CurrentUser;
        }
      } catch (profileError) {
        /*
         * Nếu /users/me lỗi nhưng login
         * đã có user thì vẫn cho login.
         */

        console.error("GET /users/me sau login:", profileError);
      }

      /* =====================
           STORE USER
        ====================== */

      if (currentUser) {
        localStorage.setItem("user", JSON.stringify(currentUser));
      }

      message.success(data?.message || "Đăng nhập thành công");

      /* =====================
           DASHBOARD
        ====================== */

      navigate("/dashboard", {
        replace: true,
      });
    } catch (error) {
      console.error("Login error:", error);

      /*
       * Nếu login thất bại thì
       * không giữ token rác.
       */

      localStorage.removeItem("access_token");

      localStorage.removeItem("user");

      message.error(
        getApiErrorMessage(error, "Email hoặc mật khẩu không đúng"),
      );
    } finally {
      setLoggingIn(false);
    }
  };

  /* =========================
     REGISTER
  ========================= */

  const handleRegister = () => {
    navigate("/register");
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

        background: "linear-gradient(135deg, #f5f7fa 0%, #eaf2ff 100%)",
      }}
    >
      <Card
        style={{
          width: "100%",

          maxWidth: 440,

          borderRadius: 18,

          boxShadow: "0 18px 60px rgba(15, 23, 42, 0.10)",
        }}
      >
        {/* =====================
            LOGO
        ====================== */}

        <div
          style={{
            textAlign: "center",

            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 68,

              height: 68,

              borderRadius: 18,

              display: "flex",

              justifyContent: "center",

              alignItems: "center",

              margin: "0 auto 14px",

              background: "#1677ff",

              color: "#ffffff",

              fontSize: 30,

              boxShadow: "0 8px 24px rgba(22, 119, 255, 0.25)",
            }}
          >
            <MedicineBoxOutlined />
          </div>

          <Title
            level={3}
            style={{
              margin: 0,
            }}
          >
            VASD Pharmacy
          </Title>

          <Text type="secondary">Hệ thống quản lý kho thuốc</Text>
        </div>

        {/* =====================
            REGISTER SUCCESS
        ====================== */}

        {registeredEmail && (
          <Alert
            type="success"
            showIcon
            style={{
              marginBottom: 20,
            }}
            message="Đăng ký thành công"
            description={`Tài khoản ${registeredEmail} đã được tạo. Bạn có thể đăng nhập ngay.`}
          />
        )}

        {/* =====================
            LOGIN FORM
        ====================== */}

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            email: registeredEmail,
          }}
          onFinish={handleLogin}
        >
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
              allowClear
              autoComplete="email"
              placeholder="example@gmail.com"
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
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
            />
          </Form.Item>

          {/* LOGIN */}

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            icon={<LoginOutlined />}
            loading={loggingIn}
            style={{
              marginTop: 4,
            }}
          >
            Đăng nhập
          </Button>

          {/* =====================
              REGISTER
          ====================== */}

          <div
            style={{
              marginTop: 22,

              textAlign: "center",
            }}
          >
            <Space size={6} wrap>
              <Text type="secondary">Chưa có tài khoản?</Text>

              <Button
                type="link"
                icon={<UserAddOutlined />}
                style={{
                  padding: 0,

                  height: "auto",
                }}
                onClick={handleRegister}
              >
                Đăng ký ngay
              </Button>
            </Space>
          </div>
        </Form>

        {/* =====================
            FOOTER
        ====================== */}

        <div
          style={{
            marginTop: 24,

            paddingTop: 18,

            borderTop: "1px solid #f0f0f0",

            textAlign: "center",
          }}
        >
          <Text
            type="secondary"
            style={{
              fontSize: 12,
            }}
          >
            VASD Pharmacy Management System
          </Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;
