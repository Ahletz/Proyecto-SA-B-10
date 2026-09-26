import {afterEach,describe,expect,it,vi} from 'vitest';
import {
  buildHistoryQuery,
  failureReasonLabel,
  fetchTransferStatus,
  isTerminalStatus,
  publicStatus
} from './transactions';

describe('buildHistoryQuery',()=>{
  it('envía cuenta y paginación sin filtros opcionales',()=>{
    const query=new URLSearchParams(buildHistoryQuery({accountId:'acc-1',page:2,size:10}));

    expect(query.get('accountId')).toBe('acc-1');
    expect(query.get('page')).toBe('2');
    expect(query.get('size')).toBe('10');
    expect(query.has('from')).toBe(false);
    expect(query.has('to')).toBe(false);
    expect(query.has('status')).toBe(false);
  });

  it('cubre el día completo en hora local y agrega el estado',()=>{
    const query=new URLSearchParams(buildHistoryQuery({
      accountId:'acc-1',from:'2026-09-01',to:'2026-09-30',status:'FAILED',page:0,size:20
    }));

    expect(query.get('from')).toBe(new Date('2026-09-01T00:00:00').toISOString());
    expect(query.get('to')).toBe(new Date('2026-09-30T23:59:59.999').toISOString());
    expect(query.get('status')).toBe('FAILED');
  });
});

describe('estados de la Saga',()=>{
  it('mapea el estado interno al público como transaction.status.changed',()=>{
    expect(publicStatus('COMPLETED')).toBe('APPROVED');
    expect(publicStatus('FAILED')).toBe('FAILED');
    expect(publicStatus('COMPENSATED')).toBe('FAILED');
    expect(publicStatus('PENDING')).toBe('PENDING');
    expect(publicStatus('PROCESSING')).toBe('PENDING');
    expect(publicStatus('COMPENSATING')).toBe('PENDING');
  });

  it('solo detiene el seguimiento en estados terminales',()=>{
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('COMPENSATED')).toBe(true);
    expect(isTerminalStatus('COMPENSATING')).toBe(false);
    expect(isTerminalStatus('PROCESSING')).toBe(false);
  });

  it('traduce motivos conocidos y deja pasar los desconocidos',()=>{
    expect(failureReasonLabel('KYC_NOT_VERIFIED')).toBe('Cliente sin verificación KYC');
    expect(failureReasonLabel('OTRO_MOTIVO')).toBe('OTRO_MOTIVO');
  });
});

describe('fetchTransferStatus',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  function stubResponse(status:number,body:unknown){
    vi.stubGlobal('localStorage',{getItem:()=>'token-demo'});
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify(body),{status}));
    vi.stubGlobal('fetch',fetchMock);
    return fetchMock;
  }

  it('devuelve null mientras Transaction Service todavía no conoce la transferencia (404)',async()=>{
    stubResponse(404,{message:'Not found'});

    await expect(fetchTransferStatus('corr-1')).resolves.toBeNull();
  });

  it('propaga otros errores y envía el JWT',async()=>{
    const fetchMock=stubResponse(500,{message:'Error interno'});

    await expect(fetchTransferStatus('corr-1')).rejects.toMatchObject({status:500,message:'Error interno'});
    const headers=fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-demo');
  });
});
