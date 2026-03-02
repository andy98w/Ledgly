'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2 } from 'lucide-react';
import { parseCSV, autoDetectMapping, type ParsedCSV } from '@/lib/csv-parser';
import { Button } from '@/components/ui/button';
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

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fields: ImportField[];
  onImport: (records: Record<string, string>[]) => Promise<{ success: number; errors: number }>;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

export function CSVImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onImport,
}: CSVImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parsedData, setParsedData] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
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
      const autoMapping = autoDetectMapping(parsed.headers, fields);
      setMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
        handleFile(file);
      } else {
        setError('Please upload a CSV file');
      }
    },
    [fields],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const requiredFieldsMapped = fields
    .filter((f) => f.required)
    .every((f) => mapping[f.key] !== undefined);

  const handleImport = async () => {
    if (!parsedData) return;
    setStep('importing');
    setError(null);

    const records = parsedData.rows.map((row) => {
      const record: Record<string, string> = {};
      for (const field of fields) {
        const colIndex = mapping[field.key];
        if (colIndex !== undefined && row[colIndex] !== undefined) {
          record[field.key] = row[colIndex];
        }
      }
      return record;
    });

    try {
      const result = await onImport(records);
      setResult(result);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Import failed');
      setStep('preview');
    }
  };

  const previewRows = parsedData?.rows.slice(0, 5) || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border/50 rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm font-medium mb-1">
              Drop a CSV file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .csv files
            </p>
            <div className="mt-4 text-left max-w-xs mx-auto">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Expected columns:</p>
              <div className="flex flex-wrap gap-1.5">
                {fields.map((f) => (
                  <span key={f.key} className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
                    {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-1.5">
                Columns are auto-detected from headers. You can adjust mappings in the next step.
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

        {/* Step 2: Column Mapping */}
        {step === 'mapping' && parsedData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found {parsedData.rows.length} rows and {parsedData.headers.length} columns. We auto-matched what we could — verify the mappings below:
            </p>
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-sm w-32 shrink-0">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
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

        {/* Step 3: Preview */}
        {step === 'preview' && parsedData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Preview ({Math.min(5, parsedData.rows.length)} of {parsedData.rows.length} rows):
            </p>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/30">
                    {fields
                      .filter((f) => mapping[f.key] !== undefined)
                      .map((f) => (
                        <th key={f.key} className="px-3 py-2 text-left font-medium text-xs">
                          {f.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t border-border/30">
                      {fields
                        .filter((f) => mapping[f.key] !== undefined)
                        .map((f) => (
                          <td key={f.key} className="px-3 py-2 text-muted-foreground">
                            {row[mapping[f.key]] || '—'}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 'importing' && (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm font-medium">Importing {parsedData?.rows.length} records...</p>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && result && (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm font-medium mb-1">
              Import complete
            </p>
            <p className="text-sm text-muted-foreground">
              {result.success} imported successfully
              {result.errors > 0 && `, ${result.errors} failed`}
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
              <Button onClick={handleImport}>
                Import {parsedData?.rows.length} Records
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
