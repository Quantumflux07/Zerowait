import { NextRequest, NextResponse } from 'next/server';
import { importProductsFromCsv } from '@/lib/services/productService';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let csvText = '';
    let storeId: string | undefined;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      csvText = body.csv || '';
      storeId = body.store_id;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      storeId = (formData.get('store_id') as string) || undefined;
      if (file && typeof file === 'object' && 'text' in file) {
        csvText = await (file as Blob).text();
      }
    } else {
      // Plain text CSV
      csvText = await request.text();
    }

    if (!csvText || csvText.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMPTY_CSV',
            message: 'No CSV content provided in request.',
          },
        },
        { status: 400 }
      );
    }

    const result = await importProductsFromCsv(csvText, storeId);

    return NextResponse.json({
      success: result.failed === 0,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message },
      },
      { status: 500 }
    );
  }
}
