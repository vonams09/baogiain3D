/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { 
  Settings as SettingsIcon, 
  Box, 
  Printer, 
  Coins, 
  Info, 
  Camera, 
  Plus, 
  Trash2, 
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Clock,
  Weight,
  Layers,
  Percent,
  CreditCard,
  LogIn,
  LogOut,
  User as UserIcon,
  Loader2,
  Eye,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Sparkles,
  Edit2,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'react-qr-code';
import { cn, formatCurrency } from '@/lib/utils';
import { Material, SystemSettings, QuoteParams, CalculationResult } from './types';
import { auth, db, signIn, logOut, handleFirestoreError } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

// Default Materials (Dummy for type safety if needed, but we fetch from DB)
const INITIAL_MATERIALS: Material[] = [
  { id: '1', name: 'PLA Standard', brand: 'eSUN', pricePerKg: 315000, color: 'Trắng', colorHex: '#ffffff', ownerId: 'system', category: 'PLA', inStock: true },
  { id: '2', name: 'PETG Standard', brand: 'Overture', pricePerKg: 350000, color: 'Đen', colorHex: '#000000', ownerId: 'system', category: 'PETG', inStock: true },
  { id: '3', name: 'ABS Premium', brand: 'Flashforge', pricePerKg: 315000, color: 'Xám', colorHex: '#808080', ownerId: 'system', category: 'ABS', inStock: true },
  { id: '4', name: 'ASA Heavy', brand: 'Polymaker', pricePerKg: 450000, color: 'Đen', colorHex: '#000000', ownerId: 'system', category: 'ASA', inStock: true },
];

// Material Characteristics
const MATERIAL_CHARACTERISTICS: Record<string, string> = {
  'PETG': 'Nhựa có độ bền và độ cứng khá tốt. Chịu nhiệt dưới 65°C. Bề mặt bóng , nhựa có tính trong suốt , xuyên sáng (tùy màu).',
  'PLA': 'Nhựa thân thiện môi trường, dễ in, nhiều màu đẹp. Độ cứng tốt nhưng giòn, chịu nhiệt dưới 50°C. Tự phân hủy sau một thời gian',
  'ASA': 'Chuyên dụng ngoài trời, kháng tia UV. Độ bền cơ học cao, chịu nhiệt tới 110°C và giữ màu lâu dưới tác động thời tiết.',
  'PETG-CF': 'Nhựa kỹ thuật gia cường sợi Carbon, độ cứng rất tốt. Bề mặt nhám mờ sang trọng, ổn định kích thước cao.',
  'ABS': 'Nhựa kỹ thuật bền bỉ, chịu va đập cực tốt, chịu nhiệt cao tới 90°C. Khó in , dễ cong vênh, dễ gia công hậu kỳ.',
  'TPU': 'Nhựa dẻo đàn hồi như cao su ( tùy mã ). Chống mài mòn, chống va đập và chịu uốn cong hoàn hảo. Khó in, giá thành cao'
};

const DEFAULT_SERVICE_NOTES = `Lưu ý dịch vụ in 3D

• Đặc điểm kỹ thuật: Sản phẩm in 3D FDM có thể có các vân layer nhỏ trên bề mặt, đây là đặc tính bình thường của công nghệ.
• Độ chính xác: Sai số kích thước ±0.2mm là bình thường, phù hợp cho hầu hết ứng dụng. Cửa hàng in theo file quý khách gửi, cần lưu ý gì quý khách phải báo trước khi chạy file (trước khi thanh toán)
• Bề mặt:
- Tại các bề mặt cần support sẽ có vết, có thể xử lý bằng giấy nhám mịn.
- Vết đường nối lớp (seam) chạy dọc theo thành sản phẩm.
- Một số bề mặt có thể hơi gợn nhẹ do giới hạn của công nghệ FDM.
- Các mẫu in có kích thước lớn quá 100g nhựa có thể xuất hiện vài vệt nhỏ.
• Cấu trúc: Sản phẩm có cấu trúc infill bên trong, không đặc 100% để tối ưu chi phí và thời gian.`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'quote' | 'inventory'>('quote');
  const [showShowroom, setShowShowroom] = useState(false);
  const [showroomCategory, setShowroomCategory] = useState('PLA');
  const [quoteCategory, setQuoteCategory] = useState('PLA');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const quoteRef = useRef<HTMLElement>(null);
  
  // State for Settings
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    machinePowerW: 200,
    electricityPriceKwh: 5000,
    depreciationPerHour: 4000,
    serviceNotes: DEFAULT_SERVICE_NOTES
  });

  // State for Inventory
  const [materials, setMaterials] = useState<Material[]>([]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Settings Sync
  useEffect(() => {
    if (!user) return;
    const settingsDoc = doc(db, 'settings', user.uid);
    return onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        setSystemSettings(snapshot.data() as SystemSettings);
      }
    });
  }, [user]);

  // Materials Sync
  useEffect(() => {
    if (!user) {
      setMaterials([]);
      return;
    }
    const q = query(
      collection(db, 'materials'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Material));
      setMaterials(items);
      
      // Auto-select if nothing is selected or if current selection is invalid
      setParams(p => {
        const currentMaterial = items.find(m => m.id === p.materialId);
        if (!p.materialId || !currentMaterial) {
          const firstInCat = items.find(m => (m.category || 'PLA') === quoteCategory);
          if (firstInCat) return { ...p, materialId: firstInCat.id };
        }
        return p;
      });
    });
  }, [user, quoteCategory]);

  const saveSettings = async (newSettings: SystemSettings) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        ...newSettings,
        ownerId: user.uid
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `settings/${user.uid}`);
    }
  };

  // State for Quote Parameters
  const [params, setParams] = useState<QuoteParams>({
    materialId: materials[0]?.id || '',
    hours: 10,
    minutes: 14,
    weightG: 394,
    infillPercent: 20,
    layerHeightMm: 0.2,
    extraFee: 10000,
    note: '67UYHXF',
  });

  const selectedMaterial = materials.find(m => m.id === params.materialId);

  // Calculation Logic
  const results = useMemo<CalculationResult>(() => {
    if (!selectedMaterial) return { materialCost: 0, electricityCost: 0, depreciationCost: 0, internalTotal: 0, customerTotal: 0 };

    const totalHours = params.hours + (params.minutes / 60);
    const materialCost = (params.weightG / 1000) * selectedMaterial.pricePerKg;
    const electricityCost = (systemSettings.machinePowerW / 1000) * systemSettings.electricityPriceKwh * totalHours;
    const depreciationCost = systemSettings.depreciationPerHour * totalHours;
    
    const internalTotal = materialCost + electricityCost + depreciationCost;
    
    // Custom logic: rounded up to nearest thousand or fixed margin
    // Let's use a 2.2x margin roughly to match screenshot (108k -> 243k)
    // Or just a formula: (InternalCost * 2) + offset
    const baseCustomerTotal = internalTotal * 2.25;
    const customerTotal = Math.ceil((baseCustomerTotal + params.extraFee) / 1000) * 1000;

    return {
      materialCost,
      electricityCost,
      depreciationCost,
      internalTotal,
      customerTotal
    };
  }, [params, systemSettings, selectedMaterial]);

  const handleExportImage = async () => {
    if (!quoteRef.current) return;
    try {
      setIsCopying(true);
      const dataUrl = await htmlToImage.toPng(quoteRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      
      setTimeout(() => setIsCopying(false), 2000);
    } catch (e) {
      console.error('Copy to clipboard failed', e);
      setIsCopying(false);
      alert('Không thể sao chép ảnh vào Clipboard. Trình duyệt của bạn có thể không hỗ trợ hoặc cần cấp quyền.');
    }
  };

  const handleExportPDF = async () => {
    if (!quoteRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(quoteRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: [img.width / 2, img.height / 2]
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width / 2, img.height / 2);
        pdf.save(`BAO_GIA_${params.note || 'IN3D'}.pdf`);
      };
    } catch (e) {
      console.error('Export PDF failed', e);
      alert('Không thể xuất PDF. Vui lòng thử lại.');
    }
  };

  const handleMaterialAdd = async (materialData: Partial<Material>) => {
    if (!user) return;
    const id = Math.random().toString(36).substr(2, 9);
    try {
      await setDoc(doc(db, 'materials', id), {
        category: 'PLA',
        inStock: true,
        ...materialData,
        id,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, 'create', `materials/${id}`);
    }
  };

  const handleMaterialUpdate = async (id: string, updates: Partial<Material>) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'materials', id), {
        ...updates,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, 'update', `materials/${id}`);
    }
  };

  const handleMaterialDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'materials', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `materials/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans selection:bg-[#2563eb]/20 flex flex-col">
      {/* Bento Header */}
      <header className="h-[60px] px-8 border-b border-[#e2e8f0] bg-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center text-white">
            <Printer size={18} strokeWidth={2.5} />
          </div>
          <span className="font-extrabold text-[#2563eb] text-xl tracking-tighter">PLASTICALC HUB</span>
        </div>
        
        <nav className="flex items-center gap-8">
          <button 
            onClick={() => setActiveTab('quote')}
            className={cn(
              "text-sm font-bold tracking-tight transition-colors",
              activeTab === 'quote' ? "text-[#2563eb]" : "text-[#64748b] hover:text-[#1e293b]"
            )}
          >
            Bảng Điều Khiển
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={cn(
              "text-sm font-bold tracking-tight transition-colors",
              activeTab === 'inventory' ? "text-[#2563eb]" : "text-[#64748b] hover:text-[#1e293b]"
            )}
          >
            Nhập Kho Nhựa
          </button>
          <button 
            onClick={() => setShowShowroom(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-xs font-bold text-[#64748b] hover:text-[#2563eb] hover:border-[#2563eb]/30 transition-all"
          >
            <Eye size={14} /> Showroom
          </button>
          <div className="w-[1px] h-4 bg-[#e2e8f0]" />
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-[#64748b] bg-[#f1f5f9] px-2 py-1 rounded-md uppercase tracking-wider">
                {user.email?.split('@')[0]}
              </span>
              <button 
                onClick={() => logOut()}
                className="text-xs font-bold text-red-500 hover:text-red-600"
              >
                Đăng Xuất
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signIn()}
              className="text-sm font-bold text-[#2563eb] hover:underline"
            >
              Admin Mode
            </button>
          )}
        </nav>
      </header>
        
      <main className="flex-1 overflow-hidden p-4 grid grid-cols-[320px_1fr_280px] gap-4">
        {activeTab === 'quote' ? (
          <>
            {/* Column 1: Inputs */}
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              {/* HE THONG Section */}
              <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] shadow-sm">
                <div className="flex items-center gap-2 mb-5 text-[#64748b]">
                  <SettingsIcon size={14} />
                  <h2 className="font-bold text-[11px] uppercase tracking-[0.1em]">Hệ Thống</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Loại Nhựa</label>
                      <select 
                        value={quoteCategory}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          setQuoteCategory(newCat);
                          // Auto select first material of new category if available
                          const firstOfCat = materials.find(m => (m.category || 'PLA') === newCat);
                          if (firstOfCat) {
                            setParams(p => ({ ...p, materialId: firstOfCat.id }));
                          }
                        }}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      >
                        {['PLA', 'PETG', 'PETG-CF', 'ABS', 'ASA', 'TPU'].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Nhựa Trong Kho</label>
                      <select 
                        value={params.materialId}
                        onChange={(e) => setParams({ ...params, materialId: e.target.value })}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      >
                        {materials
                          .filter(m => (m.category || 'PLA') === quoteCategory)
                          .map(m => (
                          <option key={m.id} value={m.id} disabled={m.inStock === false}>
                            {m.category || 'PLA'} | {m.brand} - {m.color} {m.inStock === false ? '(HẾT HÀNG)' : ''}
                          </option>
                        ))}
                        {materials.filter(m => (m.category || 'PLA') === quoteCategory).length === 0 && (
                          <option value="">(Trống)</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Giá Nhựa/KG</label>
                      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-bold text-[#2563eb]">
                        {formatCurrency(selectedMaterial?.pricePerKg || 0)}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Máy (W)</label>
                      <input 
                        type="number"
                        value={systemSettings.machinePowerW}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSystemSettings(s => ({ ...s, machinePowerW: val }));
                          saveSettings({ ...systemSettings, machinePowerW: val });
                        }}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Điện/KWH</label>
                      <input 
                        type="number"
                        value={systemSettings.electricityPriceKwh}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSystemSettings(s => ({ ...s, electricityPriceKwh: val }));
                          saveSettings({ ...systemSettings, electricityPriceKwh: val });
                        }}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Khấu Hao/H</label>
                      <input 
                        type="number"
                        value={systemSettings.depreciationPerHour}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSystemSettings(s => ({ ...s, depreciationPerHour: val }));
                          saveSettings({ ...systemSettings, depreciationPerHour: val });
                        }}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* THONG SO Section */}
              <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] shadow-sm">
                <div className="flex items-center gap-2 mb-5 text-[#64748b]">
                  <Box size={14} />
                  <h2 className="font-bold text-[11px] uppercase tracking-[0.1em]">Thông Số Bản In</h2>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Giờ In</label>
                      <input 
                        type="number"
                        value={params.hours}
                        onChange={(e) => setParams({ ...params, hours: Number(e.target.value) })}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Phút</label>
                      <input 
                        type="number"
                        value={params.minutes}
                        onChange={(e) => setParams({ ...params, minutes: Number(e.target.value) })}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Cân Nặng (G)</label>
                      <input 
                        type="number"
                        value={params.weightG}
                        onChange={(e) => setParams({ ...params, weightG: Number(e.target.value) })}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[#1e293b] px-1">Infill (%)</label>
                      <input 
                        type="number"
                        value={params.infillPercent}
                        onChange={(e) => setParams({ ...params, infillPercent: Number(e.target.value) })}
                        className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-[#1e293b] px-1">Phụ Phí Xử Lý (VND)</label>
                    <input 
                      type="number"
                      value={params.extraFee}
                      onChange={(e) => setParams({ ...params, extraFee: Number(e.target.value) })}
                      className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-bold text-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-[#1e293b] px-1">Nội Dung</label>
                    <input 
                      type="text"
                      value={params.note}
                      onChange={(e) => setParams({ ...params, note: e.target.value })}
                      className="w-full bg-[#fdfdfd] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-[#2563eb] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Internal Cost Summary */}
              <div className="bg-[#f1f5f9] rounded-2xl p-5 border border-[#e2e8f0] mt-auto">
                 <div className="flex justify-between items-center text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-2">
                   <span>Giá vốn nội bộ</span>
                   <span className="text-[#1e293b]">{results.internalTotal.toLocaleString()} đ</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[11px] font-extrabold uppercase text-[#2563eb]">Tổng báo giá</span>
                    <span className="text-xl font-extrabold text-[#2563eb]">{results.customerTotal.toLocaleString()} đ</span>
                 </div>
              </div>
            </div>

            {/* Column 2: Center Display */}
            <div className="overflow-y-auto no-scrollbar">
              <main ref={quoteRef} className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] flex flex-col min-h-full">
                <div className="p-8 border-b border-[#e2e8f0] flex justify-between items-center bg-[#fdfdfd]">
                  <div>
                    <p className="text-[9px] font-black text-[#64748b] uppercase tracking-[0.3em] mb-1">NSHOP DIGITAL FABRICATION</p>
                    <h1 className="text-lg font-extrabold tracking-tight">Xác Nhận Báo Giá</h1>
                  </div>
                  <button 
                    onClick={handleExportImage}
                    title="Sao chép ảnh báo giá"
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg cursor-pointer hover:scale-105 transition-all",
                      isCopying ? "bg-[#22c55e]" : "bg-[#2563eb]"
                    )}
                  >
                    {isCopying ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>

                        <div className="p-8 space-y-8 flex-1">
                  {/* Top Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4 text-[#2563eb]">
                        <Info size={14} />
                        <h3 className="text-[10px] font-extrabold uppercase tracking-widest">Thông Số Preview</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-[9px] font-bold text-[#64748b] uppercase mb-0.5">Vật liệu</p>
                          <p className="font-bold">{selectedMaterial?.category || '---'} {selectedMaterial?.brand}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-[#64748b] uppercase mb-0.5">Khối lượng</p>
                          <p className="font-bold text-[#22c55e]">{params.weightG}G</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-[#64748b] uppercase mb-0.5">Màu sắc</p>
                          <div className="flex items-center gap-2">
                             <div className="w-4 h-4 rounded-full border border-black/5" style={{ backgroundColor: selectedMaterial?.colorHex }} />
                             <span className="font-bold">{selectedMaterial?.color || '---'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-[#64748b] uppercase mb-0.5">Thời gian in</p>
                          <p className="font-bold">{params.hours}h {params.minutes}m</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4 text-[#2563eb]">
                        <Coins size={14} />
                        <h3 className="text-[10px] font-extrabold uppercase tracking-widest">Thanh Toán</h3>
                      </div>
                      <div className="space-y-1.5 flex flex-col h-full">
                         <div className="text-[28px] font-black tracking-tighter text-[#1e293b]">
                           {results.customerTotal.toLocaleString()} <span className="text-sm font-bold text-[#64748b]">VND</span>
                         </div>
                         <button 
                           onClick={handleExportPDF}
                           className="w-full py-2 bg-[#22c55e] text-white text-[11px] font-bold rounded-xl mt-auto shadow-md hover:bg-emerald-600 transition-colors"
                         >
                           Xuất Báo Giá PDF
                         </button>
                      </div>
                    </div>
                  </div>

                  {/* Characteristics Card */}
                  <div className="bg-[#f5f3ff] border border-[#ddd6fe] rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 text-[#6d28d9]">
                      <Sparkles size={16} />
                      <h3 className="text-[11px] font-black uppercase tracking-widest">
                        Đặc tính nhựa {quoteCategory}
                      </h3>
                    </div>
                    <p className="text-[11px] font-bold text-[#4c1d95] italic leading-relaxed">
                      {MATERIAL_CHARACTERISTICS[quoteCategory] || 'Chọn loại nhựa để xem đặc tính.'}
                    </p>
                  </div>

                  {/* Notes Card */}
                  <div className="bg-[#f1f5f9] border border-[#e2e8f0] rounded-2xl p-6 relative group/notes">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[10px] font-extrabold text-[#64748b] uppercase tracking-widest flex items-center gap-2">
                        <Info size={14} className="text-[#2563eb]" /> Lưu ý dịch vụ in 3D
                      </h3>
                      {user && (
                        <button 
                          onClick={() => setIsEditingNotes(!isEditingNotes)}
                          className="p-1.5 hover:bg-[#e2e8f0] rounded-lg text-[#64748b] transition-colors"
                          title="Sửa lưu ý"
                        >
                          <Edit2 size={12} />
                        </button>
                      )}
                    </div>

                    {isEditingNotes ? (
                      <div className="space-y-3">
                        <textarea 
                          value={systemSettings.serviceNotes || DEFAULT_SERVICE_NOTES}
                          onChange={(e) => setSystemSettings(s => ({ ...s, serviceNotes: e.target.value }))}
                          className="w-full min-h-[200px] bg-white border border-[#e2e8f0] rounded-xl p-4 text-[11px] font-medium focus:ring-1 focus:ring-[#2563eb] outline-none"
                        />
                        <button 
                          onClick={() => {
                            saveSettings(systemSettings);
                            setIsEditingNotes(false);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-xs font-bold shadow-md hover:bg-blue-600 transition-colors"
                        >
                          <Save size={14} /> Lưu thay đổi
                        </button>
                      </div>
                    ) : (
                      <div className="whitespace-pre-line text-[10px] text-[#64748b] font-bold leading-[1.6]">
                        {systemSettings.serviceNotes || DEFAULT_SERVICE_NOTES}
                      </div>
                    )}
                  </div>

                  {/* QR & Bank Section */}
                  <div className="mt-auto border-t border-[#e2e8f0] pt-8 flex items-center gap-8">
                     <div className="p-1.5 bg-white border border-[#e2e8f0] rounded-2xl shadow-sm overflow-hidden flex items-center justify-center">
                        <img 
                          src={`https://qr.limcorp.vn/qrcode.png?bank=970448&&number=0344970774&amount=${results.customerTotal}&content=${encodeURIComponent(params.note)}`}
                          alt="Chuyển khoản QR"
                          className="w-[110px] h-[110px] object-contain"
                          referrerPolicy="no-referrer"
                        />
                     </div>
                     <div className="space-y-4">
                        <div>
                          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Thông tin chuyển khoản</p>
                          <p className="text-sm font-extrabold uppercase tracking-tight text-[#2563eb]">CTK: VO THANH NAM • NGÂN HÀNG OCB</p>
                          <p className="text-[10px] font-bold text-[#64748b] mt-0.5">STK: 0344970774</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Nội dung</p>
                          <p className="text-xl font-black tracking-tighter uppercase">{params.note}</p>
                        </div>
                     </div>
                  </div>
                </div>
              </main>
            </div>

            {/* Column 3: Quick Reference / Inventory List */}
            <div className="flex flex-col gap-4 overflow-y-auto pl-1">
              <div className="bg-white rounded-2xl p-5 border border-[#e2e8f0] shadow-sm flex flex-col h-full">
                <div className="flex items-center gap-2 mb-4 text-[#64748b]">
                  <Box size={14} />
                  <h2 className="font-bold text-[11px] uppercase tracking-[0.1em]">Kho Nhựa Tham Khảo</h2>
                </div>
                
                <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar pb-4">
                  {materials.map(m => (
                    <div key={m.id} className="group p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl hover:border-[#2563eb]/30 transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg border border-[#e2e8f0] overflow-hidden flex items-center justify-center">
                          {m.imageUrl ? (
                            <img src={m.imageUrl} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                            <Box size={16} className="text-[#cbd5e1]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold leading-none mb-1">{m.category} {m.brand}</p>
                          <div className="flex items-center gap-1.5 opacity-60">
                             <div className="w-2 h-2 rounded-full border border-black/5" style={{ backgroundColor: m.colorHex }} />
                             <p className="text-[9px] font-bold truncate max-w-[80px]">{m.color || '---'}</p>
                          </div>
                          <p className="text-[10px] font-bold text-[#2563eb] mt-1">{formatCurrency(m.pricePerKg)}</p>
                        </div>
                        <div className="w-3 h-3 rounded-full border border-black/5" style={{ backgroundColor: m.colorHex }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-[#e2e8f0] mt-auto">
                   <div className="bg-[#2563eb] rounded-xl p-3 text-white">
                      <p className="text-[9px] font-bold uppercase opacity-80 mb-1">Tổng tồn kho</p>
                      <p className="text-lg font-black tracking-tight">{materials.length} Loại</p>
                   </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Bento-style Inventory tab */
          <div className="col-span-3 bg-white rounded-2xl p-8 border border-[#e2e8f0] overflow-y-auto shadow-sm">
             <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b border-[#e2e8f0] pb-6">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight">Quản Lý Kho Nhựa</h2>
                    <p className="text-sm font-medium text-[#64748b]">
                      Cập nhật danh sách vật liệu và bảng giá hệ thống
                    </p>
                  </div>
                  {user && (
                    <button 
                      onClick={() => handleMaterialAdd({
                        name: 'Nhựa Mới',
                        brand: 'Hãng Nhựa',
                        pricePerKg: 300000,
                        color: 'Chưa đặt màu',
                        colorHex: '#3b82f6'
                      })}
                      className="bg-[#2563eb] text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:scale-105 transition-all flex items-center gap-2"
                    >
                      <Plus size={18} /> Thêm Nhựa
                    </button>
                  )}
                </div>

                {authLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 size={32} className="animate-spin text-[#2563eb]" />
                    <p className="text-sm font-bold text-[#64748b]">Đang tải kho nhựa...</p>
                  </div>
                ) : !user ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-[#f8fafc] border-2 border-dashed border-[#e2e8f0] rounded-[32px] gap-6">
                    <UserIcon size={48} className="text-[#cbd5e1]" />
                    <div className="text-center">
                      <h3 className="font-bold text-lg mb-2">Chưa đăng nhập</h3>
                      <p className="text-sm text-[#64748b] mb-6">Đăng nhập tài khoản Admin để quản lý dữ liệu kho.</p>
                      <button 
                        onClick={() => signIn()}
                        className="bg-[#2563eb] text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2 mx-auto"
                      >
                        <LogIn size={18} /> Đăng nhập Google
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {materials.map(m => (
                      <div key={m.id} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl overflow-hidden group">
                        <div className="h-32 bg-[#cbd5e1] relative overflow-hidden flex items-center justify-center">
                          {m.imageUrl ? (
                            <img src={m.imageUrl} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                             <Camera size={32} className="text-white/40" />
                          )}
                          <label className="absolute inset-0 bg-[#2563eb]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white font-bold text-xs">
                             Tải ảnh mới
                             <input 
                               type="file" className="hidden" accept="image/*"
                               onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if (file) {
                                   const reader = new FileReader();
                                   reader.onloadend = () => handleMaterialUpdate(m.id, { imageUrl: reader.result as string });
                                   reader.readAsDataURL(file);
                                 }
                               }}
                             />
                          </label>
                          <button 
                            onClick={() => handleMaterialDelete(m.id)}
                            className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="p-4 space-y-3">
                           <div>
                              <div className="flex gap-1 items-center mt-1">
                                <select 
                                  value={m.category || 'PLA'}
                                  onChange={(e) => handleMaterialUpdate(m.id, { category: e.target.value })}
                                  className="text-[9px] font-black bg-[#e2e8f0] text-[#1e293b] px-1.5 py-0.5 rounded uppercase tracking-tighter"
                                >
                                  {['PLA', 'PETG', 'PETG-CF', 'ABS', 'ASA', 'TPU'].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[8px] font-bold text-[#64748b] uppercase px-1">Hãng</label>
                                  <input 
                                    defaultValue={m.brand} 
                                    onBlur={(e) => handleMaterialUpdate(m.id, { brand: e.target.value })}
                                    placeholder="Hãng"
                                    className="w-full text-[10px] font-bold text-[#1e293b] bg-white border border-[#e2e8f0] px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563eb]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[8px] font-bold text-[#64748b] uppercase px-1 text-right">Màu</label>
                                  <input 
                                    defaultValue={m.color} 
                                    onBlur={(e) => handleMaterialUpdate(m.id, { color: e.target.value })}
                                    placeholder="Màu sắc"
                                    className="w-full text-[10px] font-bold text-[#2563eb] bg-white border border-[#e2e8f0] px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563eb] text-right"
                                  />
                                </div>
                              </div>
                           </div>
                           <div className="flex justify-between items-end gap-2">
                              <div className="flex-1">
                                <label className="text-[8px] font-extrabold uppercase text-[#64748b] block mb-0.5">Giá / KG</label>
                                <input 
                                  type="number"
                                  defaultValue={m.pricePerKg} 
                                  onBlur={(e) => handleMaterialUpdate(m.id, { pricePerKg: Number(e.target.value) })}
                                  className="w-full bg-white border border-[#e2e8f0] rounded-lg px-2 py-1 text-xs font-bold text-[#2563eb]"
                                />
                              </div>
                              <div className="flex flex-col gap-1 items-center">
                                <label className="text-[8px] font-extrabold uppercase text-[#64748b]">Tổn</label>
                                <button
                                  onClick={() => handleMaterialUpdate(m.id, { inStock: !(m.inStock ?? true) })}
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors border",
                                    (m.inStock ?? true) 
                                      ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                      : "bg-red-50 text-red-600 border-red-100"
                                  )}
                                  title={(m.inStock ?? true) ? "Còn hàng" : "Hết hàng"}
                                >
                                  {(m.inStock ?? true) ? <Plus size={14} /> : <X size={14} />}
                                </button>
                              </div>
                              <div className="w-10 h-10 rounded-xl relative border border-[#e2e8f0] overflow-hidden" style={{ backgroundColor: m.colorHex }}>
                                 <input 
                                   type="color" value={m.colorHex} 
                                   onChange={(e) => handleMaterialUpdate(m.id, { colorHex: e.target.value })}
                                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                 />
                              </div>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>
        )}
      </main>
      
      {/* Footer Bar */}
      <footer className="h-8 bg-[#1e293b] flex items-center justify-center shrink-0">
        <p className="text-[8px] text-white/40 font-bold uppercase tracking-[0.5em]">NSHOPVN • PREMIUM 3D PRINTING SERVICE</p>
      </footer>

      {/* Showroom Overlay */}
      <AnimatePresence>
        {showShowroom && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#f8fafc] flex flex-col"
          >
            {/* Showroom Header */}
            <header className="h-[70px] px-8 bg-white border-b border-[#e2e8f0] flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => setShowShowroom(false)}
                  className="p-2 hover:bg-[#f1f5f9] rounded-xl transition-colors text-[#64748b]"
                >
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-[#1e293b]">BỘ SƯU TẬP MÀU SẮC</h1>
                  <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Danh mục nhựa thực tế tại kho</p>
                </div>
              </div>

              <div className="flex gap-2">
                {['PLA', 'PETG', 'PETG-CF', 'ABS', 'ASA', 'TPU'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setShowroomCategory(cat)}
                    className={cn(
                      "px-5 py-2 rounded-xl text-xs font-black transition-all",
                      showroomCategory === cat 
                        ? "bg-[#2563eb] text-white shadow-lg shadow-blue-200" 
                        : "bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </header>

            {/* Showroom Content */}
            <div className="flex-1 overflow-y-auto p-12">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-12">
                   <div>
                      <h2 className="text-4xl font-black tracking-tighter text-[#1e293b] mb-2">{showroomCategory} SERIES</h2>
                      <div className="h-1.5 w-24 bg-[#2563eb] rounded-full" />
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-black text-[#64748b] uppercase tracking-[0.2em]">Tổng số lượng</p>
                      <p className="text-3xl font-black text-[#2563eb]">
                        {materials.filter(m => (m.category || 'PLA') === showroomCategory).length} Mẫu
                      </p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {materials
                    .filter(m => (m.category || 'PLA') === showroomCategory)
                    .map(m => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={m.id} 
                        className="bg-white rounded-[32px] p-4 border border-[#e2e8f0] shadow-xl shadow-slate-200/50 flex flex-col gap-4 group"
                      >
                        <div className="aspect-square bg-[#f8fafc] rounded-[24px] overflow-hidden border border-[#e2e8f0] relative">
                          {m.imageUrl ? (
                            <img 
                              src={m.imageUrl} 
                              alt={m.name} 
                              className={cn(
                                "w-full h-full object-cover group-hover:scale-110 transition-transform duration-500",
                                m.inStock === false && "grayscale opacity-50"
                              )}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#cbd5e1]">
                              <Camera size={48} strokeWidth={1.5} />
                            </div>
                          )}
                          {m.inStock === false && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="bg-red-500/90 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em] shadow-lg">
                                HẾT HÀNG
                              </div>
                            </div>
                          )}
                          <div 
                            className="absolute top-4 right-4 w-10 h-10 rounded-full border-2 border-white shadow-lg" 
                            style={{ backgroundColor: m.colorHex }}
                          />
                        </div>
                        <div className="px-2 pb-2">
                           <p className="text-[10px] font-black text-[#2563eb] uppercase tracking-widest mb-1">{m.brand}</p>
                           <h3 className="text-lg font-black tracking-tight text-[#1e293b] leading-tight mb-1">{m.category} {m.brand}</h3>
                           <p className="text-sm font-bold text-[#64748b]">{m.color}</p>
                        </div>
                      </motion.div>
                    ))}
                </div>

                {materials.filter(m => (m.category || 'PLA') === showroomCategory).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-32 opacity-30">
                     <Box size={80} strokeWidth={1} />
                     <p className="mt-4 font-black text-xl tracking-tight">CHƯA CÓ NHỰA TRONG DANH MỤC NÀY</p>
                  </div>
                )}
              </div>
            </div>

            <footer className="h-10 bg-[#1e293b] flex items-center justify-center">
               <p className="text-[9px] text-white/40 font-black uppercase tracking-[0.4em]">NSHOPVN • PHÒNG TRƯNG BÀY VẬT LIỆU CAO CẤP</p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
