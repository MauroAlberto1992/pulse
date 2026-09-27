import { csvCell, csvRow, exportFilename, jsonRow } from './export-format';

const row = {
  id: 1n,
  timestamp: new Date('2026-09-28T10:00:00Z'),
  receivedAt: new Date('2026-09-28T10:00:01Z'),
  service: 'api',
  environment: 'production',
  level: 'error',
  context: 'PatientsService',
  message: 'Failed, "quoted"\nsecond line',
  stack: null,
};

describe('export format', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(
      `"'=HYPERLINK(""http://evil"")"`,
    );
    expect(csvCell('-1+2')).toBe("'-1+2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('writes one CSV line and one JSON line per row', () => {
    expect(csvRow(row)).toBe(
      '2026-09-28T10:00:00.000Z,api,production,error,PatientsService,"Failed, ""quoted""\nsecond line",\n',
    );
    expect(JSON.parse(jsonRow(row))).toEqual({
      timestamp: '2026-09-28T10:00:00.000Z',
      service: 'api',
      environment: 'production',
      level: 'error',
      context: 'PatientsService',
      message: 'Failed, "quoted"\nsecond line',
      stack: null,
    });
  });

  it('names the file after the range and time', () => {
    const now = new Date('2026-09-28T10:05:00Z');
    expect(exportFilename('7d', 'csv', now)).toBe(
      'pulse-logs-7d-2026-09-28-10-05.csv',
    );
    expect(exportFilename('24h', 'json', now)).toBe(
      'pulse-logs-24h-2026-09-28-10-05.ndjson',
    );
  });
});
