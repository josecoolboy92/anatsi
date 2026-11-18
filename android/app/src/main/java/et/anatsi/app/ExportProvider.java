package et.anatsi.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

// Hands files the app exported (CSV, backups) to other apps, read-only.
public class ExportProvider extends ContentProvider {
    static File dir(android.content.Context c) { File d = new File(c.getCacheDir(), "exports"); d.mkdirs(); return d; }
    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) throw new FileNotFoundException();
        File f = new File(dir(getContext()), name);
        if (!f.exists()) throw new FileNotFoundException();
        return f;
    }
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] p, String s, String[] a, String o) {
        try {
            File f = fileFor(uri);
            MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
            c.addRow(new Object[] { f.getName(), f.length() });
            return c;
        } catch (FileNotFoundException e) { return null; }
    }
    @Override public String getType(Uri uri) {
        String n = String.valueOf(uri.getLastPathSegment()).toLowerCase();
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
