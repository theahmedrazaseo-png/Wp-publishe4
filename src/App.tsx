import React, { useState, useRef } from 'react';
import { 
  Layout, 
  Upload, 
  FileText, 
  Settings, 
  Send, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plus,
  Trash2,
  ExternalLink
} from 'lucide-react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { WPConfig, Article, PublishResult } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'manual' | 'bulk' | 'settings'>('manual');
  const [config, setConfig] = useState<WPConfig>({
    url: '',
    username: '',
    applicationPassword: '',
  });
  
  const [manualArticle, setManualArticle] = useState<Article>({
    title: '',
    content: '',
    status: 'draft',
    date: '',
  });

  const [bulkArticles, setBulkArticles] = useState<Article[]>([]);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setManualArticle({ ...manualArticle, [e.target.name]: e.target.value });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row: any) => ({
          title: row.title || '',
          content: row.content || '',
          slug: row.slug || '',
          status: row.status || 'draft',
          featured_image_url: row.featured_image_url || '',
          date: row.date || undefined,
        })) as Article[];
        setBulkArticles(parsed);
      },
      error: (err) => {
        setError("Failed to parse CSV: " + err.message);
      }
    });
  };

  const [internalLinks, setInternalLinks] = useState<{ keyword: string, url: string }[]>([]);
  const [newLink, setNewLink] = useState({ keyword: '', url: '' });

  const addInternalLink = () => {
    if (newLink.keyword && newLink.url) {
      setInternalLinks([...internalLinks, newLink]);
      setNewLink({ keyword: '', url: '' });
    }
  };

  const removeInternalLink = (index: number) => {
    setInternalLinks(internalLinks.filter((_, i) => i !== index));
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json();
      if (data.success) {
        setTestResult({ success: true, message: `Connected as ${data.user}` });
        fetchMetadata();
      } else {
        setTestResult({ success: false, message: data.error || 'Connection failed' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const fetchMetadata = async () => {
    if (!config.url) return;
    setIsLoadingMetadata(true);
    try {
      const [catRes, tagRes] = await Promise.all([
        fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        }),
        fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        })
      ]);
      
      if (catRes.ok) setCategories(await catRes.json());
      if (tagRes.ok) setTags(await tagRes.json());
    } catch (err) {
      console.error("Failed to fetch metadata", err);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const publishArticles = async (articles: Article[]) => {
    if (!config.url || !config.username || !config.applicationPassword) {
      setActiveTab('settings');
      setError("Please configure WordPress settings first.");
      return;
    }

    setIsPublishing(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, articles, internalLinks }),
      });

      const data = await response.json();
      if (response.ok) {
        setResults(data.results);
      } else {
        setError(data.error || "Publishing failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-[#E5E7EB] p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2271B1] rounded-lg flex items-center justify-center text-white">
            <Layout size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">WP Publisher</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'manual' ? 'bg-[#2271B1] text-white shadow-lg' : 'hover:bg-[#F3F4F6] text-[#4B5563]'}`}
          >
            <FileText size={20} />
            <span className="font-medium">Single Post</span>
          </button>
          <button 
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'bulk' ? 'bg-[#2271B1] text-white shadow-lg' : 'hover:bg-[#F3F4F6] text-[#4B5563]'}`}
          >
            <Upload size={20} />
            <span className="font-medium">Bulk Upload</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-[#2271B1] text-white shadow-lg' : 'hover:bg-[#F3F4F6] text-[#4B5563]'}`}
          >
            <Settings size={20} />
            <span className="font-medium">Settings</span>
          </button>
        </nav>

        <div className="mt-auto p-4 bg-[#F3F4F6] rounded-2xl">
          <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wider mb-2">Status</p>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.url ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium">{config.url ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="ml-64 p-12 max-w-5xl">
        <header className="mb-12">
          <h2 className="text-3xl font-bold mb-2">
            {activeTab === 'manual' && 'Create New Post'}
            {activeTab === 'bulk' && 'Bulk Article Publishing'}
            {activeTab === 'settings' && 'WordPress Configuration'}
          </h2>
          <p className="text-[#6B7280]">
            {activeTab === 'manual' && 'Draft or publish a single article directly to your site.'}
            {activeTab === 'bulk' && 'Upload a CSV file to publish multiple articles at once.'}
            {activeTab === 'settings' && 'Manage your WordPress REST API credentials.'}
          </p>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3">
            <XCircle size={20} />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white p-8 rounded-3xl border border-[#E5E7EB] shadow-sm"
            >
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">WordPress Site URL</label>
                  <input 
                    type="url" 
                    name="url"
                    value={config.url}
                    onChange={handleConfigChange}
                    placeholder="https://your-site.com"
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] focus:border-transparent outline-none transition-all"
                  />
                  <p className="text-xs text-[#9CA3AF] mt-2">Include http:// or https://</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Username</label>
                  <input 
                    type="text" 
                    name="username"
                    value={config.username}
                    onChange={handleConfigChange}
                    placeholder="admin"
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Application Password</label>
                  <input 
                    type="password" 
                    name="applicationPassword"
                    value={config.applicationPassword}
                    onChange={handleConfigChange}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] focus:border-transparent outline-none transition-all"
                  />
                  <p className="text-xs text-[#9CA3AF] mt-2">Generate this in Users &gt; Profile &gt; Application Passwords</p>
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={testConnection}
                    disabled={isTesting || !config.url}
                    className="px-6 py-3 bg-[#2271B1] text-white rounded-xl font-bold hover:bg-[#1A5C91] transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                    Test Connection
                  </button>
                  {testResult && (
                    <div className={`mt-2 p-3 rounded-xl text-sm font-medium ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {testResult.message}
                      {!testResult.success && testResult.message.includes('rejected') && (
                        <div className="mt-2 pt-2 border-t border-red-200 text-xs font-normal space-y-1">
                          <p><strong>Common Fixes:</strong></p>
                          <ul className="list-disc ml-4">
                            <li>Use your <strong>Login Username</strong> (e.g., "admin"), not your display name.</li>
                            <li>Ensure <strong>Application Passwords</strong> are enabled in WordPress.</li>
                            <li>Check if a security plugin (like Wordfence) is blocking REST API access.</li>
                            <li>The password should be the 24-character code (e.g., <code>xxxx xxxx xxxx xxxx</code>).</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-[#E5E7EB]">
                  <h4 className="font-bold mb-4">Auto Internal Links (Optional)</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <input 
                      type="text" 
                      placeholder="Keyword"
                      value={newLink.keyword}
                      onChange={(e) => setNewLink({ ...newLink, keyword: e.target.value })}
                      className="px-4 py-2 rounded-xl border border-[#E5E7EB] outline-none"
                    />
                    <div className="flex gap-2">
                      <input 
                        type="url" 
                        placeholder="URL"
                        value={newLink.url}
                        onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                        className="flex-1 px-4 py-2 rounded-xl border border-[#E5E7EB] outline-none"
                      />
                      <button 
                        onClick={addInternalLink}
                        className="p-2 bg-[#2271B1] text-white rounded-xl hover:bg-[#1A5C91]"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {internalLinks.map((link, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB]">
                        <span className="text-sm font-medium">{link.keyword} &rarr; {link.url}</span>
                        <button onClick={() => removeInternalLink(idx)} className="text-red-500 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'manual' && (
            <motion.div 
              key="manual"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl border border-[#E5E7EB] shadow-sm space-y-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Article Title</label>
                  <input 
                    type="text" 
                    name="title"
                    value={manualArticle.title}
                    onChange={handleManualChange}
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Content (HTML or Plain Text)</label>
                  <textarea 
                    name="content"
                    rows={12}
                    value={manualArticle.content}
                    onChange={handleManualChange}
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Status</label>
                    <select 
                      name="status"
                      value={manualArticle.status}
                      onChange={handleManualChange}
                      className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] outline-none bg-white"
                    >
                      <option value="draft">Draft</option>
                      <option value="publish">Publish</option>
                      <option value="pending">Pending Review</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Featured Image URL</label>
                    <input 
                      type="url" 
                      name="featured_image_url"
                      value={manualArticle.featured_image_url || ''}
                      onChange={handleManualChange}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Categories</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-[#E5E7EB] rounded-xl min-h-[50px]">
                      {isLoadingMetadata ? (
                        <Loader2 className="animate-spin text-[#9CA3AF]" size={18} />
                      ) : categories.length > 0 ? (
                        categories.map(cat => (
                          <label key={cat.id} className="flex items-center gap-2 px-3 py-1 bg-[#F3F4F6] rounded-lg cursor-pointer hover:bg-[#E5E7EB] transition-all">
                            <input 
                              type="checkbox" 
                              checked={manualArticle.categories?.includes(cat.id)}
                              onChange={(e) => {
                                const current = manualArticle.categories || [];
                                setManualArticle({
                                  ...manualArticle,
                                  categories: e.target.checked 
                                    ? [...current, cat.id] 
                                    : current.filter(id => id !== cat.id)
                                });
                              }}
                              className="w-4 h-4 text-[#2271B1] rounded"
                            />
                            <span className="text-sm font-medium">{cat.name}</span>
                          </label>
                        ))
                      ) : (
                        <span className="text-sm text-[#9CA3AF]">No categories found. Connect first.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Tags</label>
                    <div className="flex flex-wrap gap-2 p-3 border border-[#E5E7EB] rounded-xl min-h-[50px]">
                      {isLoadingMetadata ? (
                        <Loader2 className="animate-spin text-[#9CA3AF]" size={18} />
                      ) : tags.length > 0 ? (
                        tags.map(tag => (
                          <label key={tag.id} className="flex items-center gap-2 px-3 py-1 bg-[#F3F4F6] rounded-lg cursor-pointer hover:bg-[#E5E7EB] transition-all">
                            <input 
                              type="checkbox" 
                              checked={manualArticle.tags?.includes(tag.id)}
                              onChange={(e) => {
                                const current = manualArticle.tags || [];
                                setManualArticle({
                                  ...manualArticle,
                                  tags: e.target.checked 
                                    ? [...current, tag.id] 
                                    : current.filter(id => id !== tag.id)
                                });
                              }}
                              className="w-4 h-4 text-[#2271B1] rounded"
                            />
                            <span className="text-sm font-medium">{tag.name}</span>
                          </label>
                        ))
                      ) : (
                        <span className="text-sm text-[#9CA3AF]">No tags found. Connect first.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Publish Date (Optional)</label>
                    <input 
                      type="datetime-local" 
                      name="date"
                      value={manualArticle.date || ''}
                      onChange={handleManualChange}
                      className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Slug (Optional)</label>
                    <input 
                      type="text" 
                      name="slug"
                      value={manualArticle.slug || ''}
                      onChange={handleManualChange}
                      placeholder="my-article-slug"
                      className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] focus:ring-2 focus:ring-[#2271B1] outline-none"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={() => publishArticles([manualArticle])}
                disabled={isPublishing || !manualArticle.title}
                className="w-full py-4 bg-[#2271B1] text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-[#1A5C91] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                {isPublishing ? 'Publishing...' : 'Publish to WordPress'}
              </button>
            </motion.div>
          )}

          {activeTab === 'bulk' && (
            <motion.div 
              key="bulk"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#E5E7EB] rounded-3xl p-12 text-center hover:border-[#2271B1] hover:bg-[#F0F7FF] transition-all cursor-pointer group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv"
                  className="hidden"
                />
                <div className="w-16 h-16 bg-[#F3F4F6] group-hover:bg-[#E0EFFF] rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all">
                  <Upload className="text-[#9CA3AF] group-hover:text-[#2271B1]" size={32} />
                </div>
                <h3 className="text-xl font-bold mb-1">Upload CSV File</h3>
                <p className="text-[#6B7280]">Drag and drop your article CSV here, or click to browse.</p>
                <div className="mt-4 flex justify-center gap-4 text-xs font-medium text-[#9CA3AF]">
                  <span>Required: title, content</span>
                  <span>Optional: slug, status, date, featured_image_url</span>
                </div>
              </div>

              {bulkArticles.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">{bulkArticles.length} Articles Ready</h3>
                    <button 
                      onClick={() => setBulkArticles([])}
                      className="text-red-500 hover:text-red-600 font-medium text-sm flex items-center gap-1"
                    >
                      <Trash2 size={16} /> Clear All
                    </button>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#E5E7EB] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F9FAFB] border-bottom border-[#E5E7EB]">
                          <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#6B7280]">Title</th>
                          <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#6B7280]">Status</th>
                          <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#6B7280]">Image</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {bulkArticles.map((article, idx) => (
                          <tr key={idx} className="hover:bg-[#F9FAFB] transition-all">
                            <td className="px-6 py-4 font-medium">{article.title}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${article.status === 'publish' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {article.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#6B7280]">
                              {article.featured_image_url ? 'Yes' : 'No'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button 
                    onClick={() => publishArticles(bulkArticles)}
                    disabled={isPublishing}
                    className="w-full py-4 bg-[#2271B1] text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-[#1A5C91] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isPublishing ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                    {isPublishing ? 'Processing Bulk Queue...' : `Publish ${bulkArticles.length} Articles`}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Section */}
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-12 space-y-6"
          >
            <h3 className="text-2xl font-bold">Publishing Results</h3>
            <div className="grid grid-cols-1 gap-4">
              {results.map((res, idx) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-[#E5E7EB] flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    {res.status === 'success' ? (
                      <CheckCircle2 className="text-green-500" size={24} />
                    ) : (
                      <XCircle className="text-red-500" size={24} />
                    )}
                    <div>
                      <p className="font-bold">{res.title}</p>
                      {res.error && <p className="text-sm text-red-500">{res.error}</p>}
                    </div>
                  </div>
                  {res.link && (
                    <a 
                      href={res.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[#2271B1] font-bold text-sm hover:underline"
                    >
                      View Post <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
