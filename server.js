const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfCompressor = require('pdf-compressor');
const { Storage } = require('@google-cloud/storage'); // 或其他云存储服务

const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 配置文件上传
const storage = multer.memoryStorage(); // 使用内存存储替代磁盘存储

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只支持PDF文件'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 限制10MB
});

// 创建压缩和水印文件夹
const compressedDir = 'compressed/';
if (!fs.existsSync(compressedDir)) {
  fs.mkdirSync(compressedDir, { recursive: true });
}

// 压缩并添加水印的API端点
app.post('/compress', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传PDF文件' });
    }

    // 使用内存中的文件数据
    const pdfBuffer = req.file.buffer;
    
    // 压缩处理
    const compressedBuffer = await compressPDF(pdfBuffer);
    
    // 添加水印
    const watermarkedBuffer = await addWatermark(compressedBuffer);
    
    // 直接返回处理后的文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="compressed-${req.file.originalname}"`);
    res.send(watermarkedBuffer);

  } catch (error) {
    console.error('压缩失败:', error);
    res.status(500).json({ error: '压缩失败', details: error.message });
  }
});

// 文件下载路由
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(compressedDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename, (err) => {
      if (!err) {
        // 下载完成后删除文件
        setTimeout(() => {
          fs.unlinkSync(filePath);
        }, 1000);
      }
    });
  } else {
    res.status(404).json({ error: '文件不存在' });
  }
});

// 添加错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: '服务器错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
  });
});

// 添加健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`服务器运行在端口 ${port}`);
}); 