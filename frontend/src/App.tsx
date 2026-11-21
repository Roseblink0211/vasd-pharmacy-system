import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Medicines from "./pages/Medicines";
import Suppliers from "./pages/Suppliers";
import Warehouses from "./pages/Warehouses";
import PurchaseReceipts from "./pages/PurchaseReceipts";
import Inventory from "./pages/Inventory";
import WarehouseTransfers from "./pages/WarehouseTransfers";
import Sales from "./pages/Sales";
import CustomerReturns from "./pages/CustomerReturns";
import ApprovalRequests from "./pages/ApprovalRequests";
import SupplierReturns from "./pages/SupplierReturns";
import StockMovements from "./pages/StockMovements";
import Profile from "./pages/Profile";
import UserManagement from "./pages/UserManagement";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* =========================
            PUBLIC
        ========================= */}
        <Route
          path="/login"
          element={<Login />}
        />

        {/* =========================
            PROTECTED
        ========================= */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/medicines"
            element={<Medicines />}
          />

          <Route
            path="/suppliers"
            element={<Suppliers />}
          />

          <Route
            path="/warehouses"
            element={<Warehouses />}
          />

          <Route
            path="/purchase-receipts"
            element={<PurchaseReceipts />}
          />

          <Route
            path="/inventory"
            element={<Inventory />}
          />

          <Route
            path="/warehouse-transfers"
            element={<WarehouseTransfers />}
          />

          <Route
            path="/sales"
            element={<Sales />}
          />

          <Route
            path="/customer-returns"
            element={<CustomerReturns />}
          />

          <Route
            path="/approval-requests"
            element={<ApprovalRequests />}
          />

          <Route
            path="/supplier-returns"
            element={<SupplierReturns />}
          />

          <Route
            path="/stock-movements"
            element={<StockMovements />}
          />

          <Route
            path="/profile"
            element={<Profile />}
          />

          <Route
            path="/user-management"
            element={<UserManagement />}
          />


        </Route>

        {/* =========================
            DEFAULT
        ========================= */}
        <Route
          path="/"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
