'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { parseCSV, autoDetectMapping } from '@/lib/csv-parser';
import type { ParsedCSV } from '@/lib/csv-parser';
import type { ImportField } from './csv-import-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const BANK_CSV_FIELDS: ImportField[] = [
  { key: 'date', label: 'Date', required: true, aliases: ['posting date', 'transaction date', 'posted date', 'trans date'] },
  { key: 'description', label: 'Description', required: true, aliases: ['memo', 'details', 'transaction', 'narration', 'payee'] },
  { key: 'amount', label: 'Amount', required: true, aliases: ['total', 'sum', 'debit/credit', 'transaction amount'] },
];

function detectP2PSource(description: string): string | null {
  const lower = description.toLowerCase();
  if (lower.includes('venmo')) return 'venmo';
  if (lower.includes('zelle')) return 'zelle';
  if (lower.includes('cash app') || lower.includes('cashapp')) return 'cashapp';
  if (lower.includes('paypal')) return 'paypal';
  return null;
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

interface DetectedTransaction {
  date: string;
  description: string;
  amount: number;
  p2pSource: string;
  direction: 'incoming' | 'outgoing';
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

interface BankCsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: Array<{ date: string; description: string; amount: number }>, source: string) => Promise<{ imported: number; skipped: number; duplicates: number }>;
}

export function BankCsvImportDialog({ open, onOpenChange, onImport }: BankCsvImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parsedData, setParsedData] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number; duplicates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setParsedData(null);
    setMapping({});
    setResult(null);
    setError(null);
  }, []);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError('Could not parse any data from file');
        return;
      }
      setParsedData(parsed);
      const autoMapping = autoDetectMapping(parsed.headers, BANK_CSV_FIELDS);
      setMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFile(file);
    } else {
      setError('Please upload a CSV file');
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const requiredFieldsMapped = BANK_CSV_FIELDS
    .filter((f) => f.required)
    .every((f) => mapping[f.key] !== undefined);

  const detectedTransactions: DetectedTransaction[] = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.rows
      .map((row) => {
        const dateVal = mapping.date !== undefined ? row[mapping.date] : '';
        const descVal = mapping.description !== undefined ? row[mapping.description] : '';
        const amountVal = mapping.amount !== undefined ? row[mapping.amount] : '';
        const amount = parseAmount(amountVal);
        if (!dateVal || !descVal || amount === null) return null;
        const p2pSource = detectP2PSource(descVal);
        if (!p2pSource) return null;
        return {
          date: dateVal,
          description: descVal,
          amount,
          p2pSource,
          direction: amount >= 0 ? 'incoming' as const : 'outgoing' as const,
        };
      })
      .filter((t): t is DetectedTransaction => t !== null);
  }, [parsedData, mapping]);

  const totalRows = parsedData?.rows.length || 0;
  const incomingCount = detectedTransactions.filter((t) => t.direction === 'incoming').length;
  const outgoingCount = detectedTransactions.filter((t) => t.direction === 'outgoing').length;

  const handleImport = async () => {
    setStep('importing');
    setError(null);

    const rows = detectedTransactions.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
    }));

    try {
      const result = await onImport(rows, 'bank-csv');
      setResult(result);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Import failed');
      setStep('preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Bank Statement</DialogTitle>
          <DialogDescription>Upload a CSV from your bank to detect P2P transactions (Venmo, Zelle, CashApp, PayPal)</DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border/50 rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm font-medium mb-1">
              Drop a bank CSV file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Most banks let you export transactions as .csv
            </p>
            <div className="mt-4 text-left max-w-xs mx-auto">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Expected columns:</p>
              <div className="flex flex-wrap gap-1.5">
                {BANK_CSV_FIELDS.map((f) => (
                  <span key={f.key} className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
                    {f.label}<span className="text-destructive ml-0.5">*</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-1.5">
                We'll auto-detect P2P transactions (Venmo, Zelle, CashApp, PayPal) and skip everything else.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {step === 'mapping' && parsedData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found {parsedData.rows.length} rows and {parsedData.headers.length} columns. Verify the column mappings:
            </p>
            <div className="space-y-3">
              {BANK_CSV_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-sm w-32 shrink-0">
                    {field.label}
                    <span className="text-destructive ml-0.5">*</span>
                  </span>
                  <Select
                    value={mapping[field.key]?.toString() ?? 'unmapped'}
                    onValueChange={(v) =>
                      setMapping((m) => {
                        const next = { ...m };
                        if (v === 'unmapped') {
                          delete next[field.key];
                        } else {
                          next[field.key] = parseInt(v);
                        }
                        return next;
                      })
                    }
                  >
                    <SelectTrigger className="flex-1 h-9 bg-secondary/50 border-border/50">
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unmapped">-- Skip --</SelectItem>
                      {parsedData.headers.map((header, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'preview' && parsedData && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {detectedTransactions.length} P2P transaction{detectedTransactions.length !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalRows - detectedTransactions.length} non-P2P rows skipped
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-500">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  {incomingCount} incoming
                </span>
                <span className="flex items-center gap-1 text-orange-500">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {outgoingCount} outgoing
                </span>
              </div>
            </div>

            {detectedTransactions.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No P2P transactions found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  None of the rows matched Venmo, Zelle, CashApp, or PayPal.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/50 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="bg-secondary/30">
                      <th className="px-3 py-2 text-left font-medium text-xs">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-xs">Description</th>
                      <th className="px-3 py-2 text-left font-medium text-xs">Source</th>
                      <th className="px-3 py-2 text-right font-medium text-xs">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detectedTransactions.slice(0, 50).map((t, i) => (
                      <tr key={i} className="border-t border-border/30">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{t.date}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{t.description}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-xs capitalize">{t.p2pSource}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <span className={t.direction === 'incoming' ? 'text-emerald-500' : 'text-orange-500'}>
                            {t.direction === 'incoming' ? '+' : '-'}
                            <Money cents={Math.round(Math.abs(t.amount) * 100)} size="xs" inline />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detectedTransactions.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ...and {detectedTransactions.length - 50} more
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm font-medium">Importing {detectedTransactions.length} transactions...</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm font-medium mb-1">Import complete</p>
            <p className="text-sm text-muted-foreground">
              {result.imported} imported
              {result.duplicates > 0 && `, ${result.duplicates} duplicates skipped`}
              {result.skipped > 0 && `, ${result.skipped} non-P2P skipped`}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter>
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={reset}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              <Button
                disabled={!requiredFieldsMapped}
                onClick={() => setStep('preview')}
              >
                Preview
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              <Button onClick={handleImport} disabled={detectedTransactions.length === 0}>
                Import {detectedTransactions.length} Transaction{detectedTransactions.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => handleClose(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
