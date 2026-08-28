import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuth } from '../../store/AuthContext';
import api from '../../services/api';
import { DataTable, Column } from '../../components/shared/DataTable';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { KPICard } from '../../components/shared/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { EmptyState } from '../../components/shared/EmptyState';
import { formatCurrency, formatDate } from '../../lib/utils';

interface CompensationItem {
  id: string;
  parcel_id: string;
  market_value: number | null;
  solatium: number | null;
  additional_compensation: number | null;
  total_award: number | null;
  assessed_by: string | null;
  assessment_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Assessed', value: 'assessed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Disputed', value: 'disputed' },
];

export default function CompensationDesk() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedComp, setSelectedComp] = useState<CompensationItem | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'dispute'>('approve');
  const [remarks, setRemarks] = useState('');

  // RFCTLARR 2013 Calculator State
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcArea, setCalcArea] = useState<number>(0.5);
  const [calcCircleRate, setCalcCircleRate] = useState<number>(1200);
  const [calcDistanceKm, setCalcDistanceKm] = useState<number>(15);
  const [calcAssetsVal, setCalcAssetsVal] = useState<number>(150000);
  const [calcMonths, setCalcMonths] = useState<number>(12);
  const [calcResult, setCalcResult] = useState<any | null>(null);

  // Gazette Generator State
  const [showGazetteModal, setShowGazetteModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['compensation-desk', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, any> = { page, page_size: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/compensation', { params });
      return data;
    },
  });

  // Fetch parcels for enriched info
  const { data: parcelsData } = useQuery({
    queryKey: ['compensation-parcels'],
    queryFn: async () => {
      const { data } = await api.get('/parcels', { params: { page_size: 100 } });
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await api.patch(`/compensation/${id}`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compensation-desk'] });
      setShowActionModal(false);
      setSelectedComp(null);
      setRemarks('');
    },
  });

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: async (comp: CompensationItem) => {
      // Create payment for the first owner of the parcel
      const parcelResp = await api.get(`/parcels/${comp.parcel_id}`);
      const owners = parcelResp.data.owners || [];
      if (owners.length > 0) {
        await api.post('/payments', {
          compensation_id: comp.id,
          land_owner_id: owners[0].id,
          amount: comp.total_award || 0,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compensation-desk'] });
    },
  });

  const handleAction = () => {
    if (!selectedComp) return;
    if (actionType === 'approve') {
      updateMutation.mutate({ id: selectedComp.id, status: 'approved' });
    } else {
      updateMutation.mutate({ id: selectedComp.id, status: 'disputed' });
    }
  };

  const openActionModal = (comp: CompensationItem, type: 'approve' | 'dispute') => {
    setSelectedComp(comp);
    setActionType(type);
    setShowActionModal(true);
  };

  // Build parcel lookup for enriched display
  const parcelMap: Record<string, any> = {};
  if (parcelsData?.items) {
    for (const p of parcelsData.items) {
      parcelMap[p.id] = p;
    }
  }

  const columns: Column<CompensationItem>[] = [
    {
      key: 'parcel_id',
      header: 'Parcel / Survey',
      render: (item) => {
        const parcel = parcelMap[item.parcel_id];
        return (
          <div>
            <div className="text-sm font-medium text-slate-900">
              {parcel?.survey_number || '—'}
            </div>
            <div className="text-xs text-slate-500">
              {parcel?.village_name || '—'}
            </div>
          </div>
        );
      },
      sortable: true,
    },
    {
      key: 'market_value',
      header: 'Market Value',
      render: (item) => (
        <span className="tabular-nums">{formatCurrency(item.market_value || 0)}</span>
      ),
      sortable: true,
    },
    {
      key: 'total_award',
      header: 'Total Award',
      render: (item) => (
        <span className="tabular-nums font-semibold text-emerald-700">
          {formatCurrency(item.total_award || 0)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'assessment_date',
      header: 'Assessed',
      render: (item) => formatDate(item.assessment_date),
    },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex gap-1">
          {item.status === 'assessed' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                onClick={(e) => {
                  e.stopPropagation();
                  openActionModal(item, 'approve');
                }}
              >
                ✅ Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation();
                  openActionModal(item, 'dispute');
                }}
              >
                ❌ Dispute
              </Button>
            </>
          )}
          {item.status === 'approved' && (
            <Button
              variant="outline"
              size="sm"
              className="text-blue-600 border-blue-300 hover:bg-blue-50"
              onClick={(e) => {
                e.stopPropagation();
                createPaymentMutation.mutate(item);
              }}
            >
              💰 Disburse
            </Button>
          )}
        </div>
      ),
    },
  ];

  // KPI summary
  const compensations = data?.items || [];
  const totalAward = compensations.reduce((sum: number, c: CompensationItem) => sum + (c.total_award || 0), 0);
  const pendingCount = compensations.filter((c: CompensationItem) => c.status === 'assessed').length;
  const approvedCount = compensations.filter((c: CompensationItem) => c.status === 'approved').length;
  const disputedCount = compensations.filter((c: CompensationItem) => c.status === 'disputed').length;

  const runStatutoryCalc = async () => {
    try {
      const { data } = await api.post('/compensation/calculate-statutory', {
        area_hectares: calcArea,
        circle_rate_per_sqm: calcCircleRate,
        urban_distance_km: calcDistanceKm,
        assets_value: calcAssetsVal,
        interest_months: calcMonths,
      });
      setCalcResult(data);
    } catch (e: any) {
      alert('Calculation error: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💰 Compensation Desk</h1>
            <p className="text-slate-500 text-sm">
              Assess, approve, and disburse compensation under RFCTLARR Act, 2013
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-semibold"
              onClick={() => {
                setShowCalcModal(true);
                runStatutoryCalc();
              }}
            >
              ⚖️ RFCTLARR 2013 Calculator
            </Button>
            <Button
              variant="outline"
              className="bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold"
              onClick={() => setShowGazetteModal(true)}
            >
              📜 MoRTH Gazette Draft (S.O. 1988E)
            </Button>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="Pending Assessment" value={pendingCount} icon="📝" index={0} />
        <KPICard label="Approved" value={approvedCount} icon="✅" index={1} />
        <KPICard label="Disputed" value={disputedCount} icon="⚠️" index={2} />
        <KPICard label="Total Award Value" value={formatCurrency(totalAward)} icon="💰" index={3} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1" />
            <span className="text-sm text-slate-500">
              {data?.total || 0} compensation records
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={compensations}
        total={data?.total || 0}
        page={page}
        pageSize={20}
        searchPlaceholder="Search by parcel ID..."
        onSearch={(term) => {
          setSearch(term);
          setPage(1);
        }}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="No compensation records found"
        onRowClick={(item) => setSelectedComp(item)}
      />

      {/* Action Modal */}
      {showActionModal && selectedComp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md"
          >
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {actionType === 'approve' ? '✅ Approve Compensation' : '❌ Dispute Compensation'}
            </h3>
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                <strong>Total Award:</strong>{' '}
                <span className="tabular-nums">{formatCurrency(selectedComp.total_award || 0)}</span>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Remarks</label>
                <Input
                  placeholder="Enter remarks..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowActionModal(false)}>
                Cancel
              </Button>
              <Button
                variant={actionType === 'approve' ? 'default' : 'destructive'}
                onClick={handleAction}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Dispute'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Detail Sidebar */}
      {selectedComp && !showActionModal && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white border-l border-slate-200 shadow-2xl overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Compensation Details</h3>
              <button
                onClick={() => setSelectedComp(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Parcel</label>
                <p className="text-sm text-slate-900">
                  {parcelMap[selectedComp.parcel_id]?.survey_number || '—'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Market Value</label>
                <p className="text-sm text-slate-900 tabular-nums">
                  {formatCurrency(selectedComp.market_value || 0)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Solatium (100%)</label>
                <p className="text-sm text-slate-900 tabular-nums">
                  {formatCurrency(selectedComp.solatium || 0)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Additional Compensation</label>
                <p className="text-sm text-slate-900 tabular-nums">
                  {formatCurrency(selectedComp.additional_compensation || 0)}
                </p>
              </div>
              <div className="border-t pt-3">
                <label className="text-xs font-medium text-slate-500">Total Award</label>
                <p className="text-lg font-bold text-emerald-700 tabular-nums">
                  {formatCurrency(selectedComp.total_award || 0)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Status</label>
                <div className="mt-1">
                  <StatusBadge status={selectedComp.status} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Assessment Date</label>
                <p className="text-sm text-slate-900">
                  {formatDate(selectedComp.assessment_date)}
                </p>
              </div>
              {selectedComp.status === 'assessed' && (
                <div className="flex gap-2 pt-4">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => openActionModal(selectedComp, 'approve')}
                  >
                    ✅ Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => openActionModal(selectedComp, 'dispute')}
                  >
                    ❌ Dispute
                  </Button>
                </div>
              )}
              {selectedComp.status === 'approved' && (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => createPaymentMutation.mutate(selectedComp)}
                >
                  💰 Disburse Payment
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RFCTLARR 2013 Calculator Modal */}
      {showCalcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  ⚖️ RFCTLARR Act, 2013 Statutory Compensation Engine
                </h3>
                <p className="text-xs text-slate-500">
                  First Schedule statutory multiplier + Section 30(1) 100% Solatium + Section 30(3) 12% AMV
                </p>
              </div>
              <button
                onClick={() => setShowCalcModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Land Area (Hectares)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={calcArea}
                    onChange={(e) => setCalcArea(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                  <span className="text-[10px] text-slate-500">
                    = {(calcArea * 10000).toLocaleString()} sq. meters (~{(calcArea * 2.471).toFixed(2)} acres)
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Circle Rate (₹ / sq.m)</label>
                  <Input
                    type="number"
                    value={calcCircleRate}
                    onChange={(e) => setCalcCircleRate(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                  <span className="text-[10px] text-slate-500">DLC / Sub-Registrar benchmark value</span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Urban Center Distance (km)</label>
                  <Input
                    type="number"
                    value={calcDistanceKm}
                    onChange={(e) => setCalcDistanceKm(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                  <span className="text-[10px] text-indigo-600 font-medium">
                    {calcDistanceKm <= 10
                      ? 'Multiplier: 1.0x (Urban)'
                      : calcDistanceKm <= 20
                      ? 'Multiplier: 1.25x (Semi-rural)'
                      : calcDistanceKm <= 30
                      ? 'Multiplier: 1.50x (Rural)'
                      : calcDistanceKm <= 50
                      ? 'Multiplier: 1.75x (Deep Rural)'
                      : 'Multiplier: 2.00x (Remote)'}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Attached Assets / Trees (₹)</label>
                  <Input
                    type="number"
                    value={calcAssetsVal}
                    onChange={(e) => setCalcAssetsVal(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                  <span className="text-[10px] text-slate-500">Structures, borewells, horticulture</span>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={runStatutoryCalc} className="bg-indigo-600 hover:bg-indigo-700 text-xs">
                  ⚡ Recalculate Statutory Award
                </Button>
              </div>

              {calcResult && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Statutory Award Breakdown
                    </span>
                    <span className="text-xs font-semibold text-indigo-600">
                      {calcResult.location_classification}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-slate-600">Base Land Value:</div>
                    <div className="text-right font-medium text-slate-900">
                      {formatCurrency(calcResult.base_circle_rate_value)}
                    </div>

                    <div className="text-slate-600">Rural Multiplier Factor:</div>
                    <div className="text-right font-bold text-indigo-700">
                      {calcResult.rural_multiplier_factor}x
                    </div>

                    <div className="text-slate-600">Multiplied Market Value (Sec 26):</div>
                    <div className="text-right font-medium text-slate-900">
                      {formatCurrency(calcResult.multiplied_land_value)}
                    </div>

                    <div className="text-slate-600">Attached Assets Value:</div>
                    <div className="text-right font-medium text-slate-900">
                      {formatCurrency(calcResult.assets_value)}
                    </div>

                    <div className="text-slate-600">12% p.a. Additional Market Value (Sec 30(3)):</div>
                    <div className="text-right font-medium text-amber-700">
                      + {formatCurrency(calcResult.additional_market_value_12_pct)}
                    </div>

                    <div className="text-slate-600 font-semibold">100% Solatium (Sec 30(1)):</div>
                    <div className="text-right font-bold text-emerald-700">
                      + {formatCurrency(calcResult.solatium_100_percent)}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">Total Statutory Award:</span>
                    <span className="text-xl font-extrabold text-emerald-700">
                      {formatCurrency(calcResult.total_statutory_award)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button onClick={() => setShowCalcModal(false)}>Done</Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* MoRTH Gazette Draft Generator Modal */}
      {showGazetteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-8 max-h-[90vh] flex flex-col font-serif"
          >
            <div className="flex justify-between items-start border-b border-slate-300 pb-4">
              <div className="text-center w-full space-y-1">
                <div className="text-2xl font-bold text-slate-900">भारत का राजपत्र</div>
                <div className="text-lg font-bold tracking-widest text-slate-900">The Gazette of India</div>
                <div className="text-xs uppercase font-sans text-slate-600 tracking-wider">
                  EXTRAORDINARY • PART II — Section 3 — Sub-section (ii)
                </div>
                <div className="text-xs font-sans text-slate-600">
                  MINISTRY OF ROAD TRANSPORT AND HIGHWAYS (MoRTH) • NOTIFICATION S.O. 1988E
                </div>
              </div>
              <button
                onClick={() => setShowGazetteModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold font-sans"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs font-sans text-slate-800 leading-relaxed">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <p>
                  <strong>S.O. 1988(E).</strong> — In exercise of powers conferred by sub-section (1) of section 3A of the National Highways Act, 1956 (48 of 1956), the Central Government hereby declares its intention to acquire the land specified in the Schedule annexed hereto for building (widening/four-laning), maintenance, management, and operation of National Highway corridor in District Khordha in the State of ODISHA.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2">SCHEDULE OF LAND (भूमिस अनुसूची)</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">S.No</th>
                        <th className="p-2">Survey No. / खसरा</th>
                        <th className="p-2">Village / गाँव</th>
                        <th className="p-2">Nature / प्रकृति</th>
                        <th className="p-2">Area (Ha)</th>
                        <th className="p-2">Interested Parties / भू-स्वामी</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="p-2 font-medium">1</td>
                        <td className="p-2 font-bold">242 (२४२)</td>
                        <td className="p-2">Kanjiama (कं जियमा)</td>
                        <td className="p-2">Government</td>
                        <td className="p-2 font-mono">0.0607</td>
                        <td className="p-2">Anabadi (अनबाडी)</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">2</td>
                        <td className="p-2 font-bold">249 (२४९)</td>
                        <td className="p-2">Kanjiama (कं जियमा)</td>
                        <td className="p-2">Private</td>
                        <td className="p-2 font-mono">0.1052</td>
                        <td className="p-2">Mek Developers, Bhabeni Behera</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">3</td>
                        <td className="p-2 font-bold">258 (२५८)</td>
                        <td className="p-2">Kanjiama (कं जियमा)</td>
                        <td className="p-2">Private</td>
                        <td className="p-2 font-mono">0.2104</td>
                        <td className="p-2">Banchha Padhan, Srinivas Sahoo</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-white border border-emerald-300 rounded flex items-center justify-center font-mono font-bold text-xs">
                    [ QR ]
                  </div>
                  <div>
                    <div className="font-bold text-emerald-900">Official Digital Seal & QR Verification</div>
                    <div className="text-[10px] text-emerald-700">
                      Digitally verified under Bhoomi Rashi Integration Protocol • Ref: MoRTH-OD-2020-1988E
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-sans text-xs"
                  onClick={() => alert('🖨️ Gazette PDF generated and ready for print!')}
                >
                  📥 Export Gazette PDF
                </Button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end font-sans">
              <Button variant="outline" onClick={() => setShowGazetteModal(false)}>
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

