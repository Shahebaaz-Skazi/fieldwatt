import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { AlertCircle, CheckCircle2, ChevronRight, RefreshCw, ImageOff } from 'lucide-react';

export default function Corrections() {
  const [data, setData] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const inputRef = useRef(null);

  const fetchNext = async () => {
    setLoading(true);
    setError(null);
    setNewValue('');
    try {
      const res = await api.get('/admin/corrections');
      if (res.data && res.data.data) {
        setData(res.data.data);
        setRemaining(res.data.remaining);
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 100);
      } else {
        setData(null);
        setRemaining(0);
      }
    } catch (err) {
      setError('Failed to fetch next correction.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNext();
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!newValue || submitting || !data) return;
    
    setSubmitting(true);
    try {
      await api.post(`/admin/corrections/${data.reading_id}`, { corrected_value: newValue });
      await fetchNext();
    } catch (err) {
      setError('Failed to submit correction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!data || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/corrections/${data.reading_id}/skip`);
      await fetchNext();
    } catch (err) {
      setError('Failed to skip correction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-6">
        <AlertCircle className="text-red-500" size={64} />
        <h2 className="text-2xl font-bold text-red-700">Error Loading Data</h2>
        <p className="text-red-600">{error}</p>
        <button onClick={fetchNext} className="btn mt-4 bg-gray-800 text-white px-4 py-2 rounded-lg">Try Again</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <CheckCircle2 className="text-green-500" size={64} />
        <h2 className="text-2xl font-bold">All caught up!</h2>
        <p className="text-gray-500">There are no pending reading corrections.</p>
        <button onClick={fetchNext} className="btn-primary mt-4">Refresh</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Rapid Corrections</h1>
          <p className="text-gray-500">Fixing wrong readings submitted by agents.</p>
        </div>
        <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold text-lg border border-blue-200 shadow-sm">
          {remaining} left
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Left Side: Photo */}
        <div className="bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex flex-col shadow-inner relative group">
          {data.photo_url ? (
            <img 
              src={data.photo_url} 
              alt="Meter" 
              className="w-full h-full object-contain"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <ImageOff size={48} className="mb-2" />
              <p>No Photo Available</p>
            </div>
          )}
        </div>

        {/* Right Side: Data and Form */}
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 border-b pb-2">Property Details</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-3">
                <span className="text-gray-500 text-sm">Consumer</span>
                <span className="col-span-2 font-medium">{data.consumer_name || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-gray-500 text-sm">BP / Serial</span>
                <span className="col-span-2 font-mono">{data.bp_no} / {data.serial_no}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-gray-500 text-sm">Meter No</span>
                <span className="col-span-2">{data.meter_no || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-gray-500 text-sm">Agent</span>
                <span className="col-span-2">{data.agent_name || 'Unknown'}</span>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-red-800 font-semibold mb-1">Wrong Reading Submitted</h3>
            <p className="text-4xl font-mono font-bold text-red-600 tracking-wider">
              {data.original_value}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 p-6 rounded-xl shadow-sm flex flex-col gap-4">
            <div>
              <label className="block text-blue-900 font-semibold mb-2">Enter Corrected Reading (Black Dials Only)</label>
              <input
                ref={inputRef}
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="w-full text-3xl p-4 rounded-lg border-2 border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-mono tracking-wider font-bold"
                placeholder="e.g. 510"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <button 
                type="submit" 
                disabled={!newValue || submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-lg font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? <RefreshCw className="animate-spin" /> : <CheckCircle2 />}
                Save & Next
              </button>
              
              <button 
                type="button" 
                onClick={handleSkip}
                disabled={submitting}
                className="px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Skip <ChevronRight size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
